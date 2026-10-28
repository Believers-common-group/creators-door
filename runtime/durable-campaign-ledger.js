// Node-only SQLite conformance ledger; single host, not distributed storage.
// Requires Node >=22 with --experimental-sqlite. Never import into the web UI.
import { DatabaseSync } from 'node:sqlite';

function ref(value, name) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:._/-]{3,256}$/.test(value))
    throw new Error('invalid_' + name);
  return value;
}
function instant(value, name) {
  const n = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(n)) throw new Error('invalid_' + name);
  return n;
}
function sha(value) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error('invalid_sha256_digest');
  return value;
}

export function openDurableCampaignLedger(path) {
  if (typeof path !== 'string' || !path.trim() || path === ':memory:')
    throw new Error('durable_file_path_required');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS nonce_bindings(' +
      'issuer TEXT NOT NULL, nonce TEXT NOT NULL, request_ref TEXT NOT NULL,' +
      'decision_ref TEXT NOT NULL, valid_until_ms INTEGER NOT NULL,' +
      'first_seen_ms INTEGER NOT NULL, PRIMARY KEY(issuer,nonce));' +
    'CREATE TABLE IF NOT EXISTS request_ledger(' +
      'request_ref TEXT PRIMARY KEY, intent_digest TEXT NOT NULL,' +
      "state TEXT NOT NULL CHECK(state IN ('PENDING','EXCEPTION','RECEIPTED'))," +
      'created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS river_receipts(' +
      'request_ref TEXT PRIMARY KEY REFERENCES request_ledger(request_ref),' +
      'receipt_ref TEXT NOT NULL UNIQUE, envelope TEXT NOT NULL,' +
      'envelope_digest TEXT NOT NULL, verified_ms INTEGER NOT NULL);'
  );
  db.exec('PRAGMA foreign_keys = ON');

  function bindNonce({ issuer, nonce, requestRef, decisionRef, validUntil, at }) {
    ref(issuer,'issuer'); ref(nonce,'nonce'); ref(requestRef,'request_ref');
    ref(decisionRef,'decision_ref');
    const checked = instant(at,'checked_at'), expires = instant(validUntil,'valid_until');
    if (checked >= expires) return false;
    db.prepare('INSERT OR IGNORE INTO nonce_bindings ' +
      '(issuer,nonce,request_ref,decision_ref,valid_until_ms,first_seen_ms) ' +
      'VALUES(?,?,?,?,?,?)').run(issuer,nonce,requestRef,decisionRef,expires,checked);
    const existing = db.prepare('SELECT request_ref,decision_ref,valid_until_ms ' +
      'FROM nonce_bindings WHERE issuer=? AND nonce=?').get(issuer,nonce);
    // Never reassign a nonce to another request, even after expiration.
    return Boolean(existing && existing.request_ref===requestRef &&
      existing.decision_ref===decisionRef && existing.valid_until_ms===expires);
  }

  function claimRequest({ requestRef, intentDigest, at }) {
    ref(requestRef,'request_ref'); sha(intentDigest);
    const now=instant(at,'claim_time');
    const inserted = db.prepare('INSERT OR IGNORE INTO request_ledger ' +
      '(request_ref,intent_digest,state,created_ms,updated_ms) ' +
      "VALUES(?,?,'PENDING',?,?)").run(requestRef,intentDigest,now,now);
    const record=db.prepare('SELECT intent_digest,state FROM request_ledger ' +
      'WHERE request_ref=?').get(requestRef);
    if (!record || record.intent_digest!==intentDigest)
      throw new Error('request_ref_fingerprint_conflict');
    // Existing PENDING/EXCEPTION is NOT a license to re-execute.
    return Object.freeze({created:inserted.changes===1,state:record.state});
  }

  function markException({requestRef,intentDigest,at}) {
    ref(requestRef,'request_ref');sha(intentDigest);
    const now=instant(at,'exception_time');
    db.prepare("UPDATE request_ledger SET state='EXCEPTION',updated_ms=? " +
      "WHERE request_ref=? AND intent_digest=? AND state='PENDING'")
      .run(now,requestRef,intentDigest);
    const r=db.prepare('SELECT intent_digest,state FROM request_ledger WHERE request_ref=?')
      .get(requestRef);
    if(!r||r.intent_digest!==intentDigest)throw new Error('request_not_found_or_mismatch');
    return Object.freeze({state:r.state});
  }

  // Privileged backend method. The caller must independently verify signature
  // and scope using createVerifiedRiverReceiptRecorder.
  function commitVerifiedReceipt({requestRef,intentDigest,receiptRef,envelope,envelopeDigest,at}) {
    ref(requestRef,'request_ref');ref(receiptRef,'receipt_ref');
    sha(intentDigest);sha(envelopeDigest);
    if(typeof envelope!=='string'||envelope.length>16000)
      throw new Error('invalid_receipt_envelope');
    const now=instant(at,'receipt_time');
    db.exec('BEGIN IMMEDIATE');
    try {
      const r=db.prepare('SELECT intent_digest,state FROM request_ledger WHERE request_ref=?')
        .get(requestRef);
      if(!r||r.intent_digest!==intentDigest)throw new Error('request_not_found_or_mismatch');
      const old=db.prepare('SELECT receipt_ref,envelope_digest FROM river_receipts ' +
        'WHERE request_ref=?').get(requestRef);
      if(old) {
        if(old.receipt_ref!==receiptRef||old.envelope_digest!==envelopeDigest)
          throw new Error('verified_receipt_replay_conflict');
        db.exec('COMMIT');
        return Object.freeze({state:'RECEIPTED',replay:true,receiptRef});
      }
      if(r.state!=='PENDING'&&r.state!=='EXCEPTION')throw new Error('request_state_conflict');
      db.prepare('INSERT INTO river_receipts ' +
        '(request_ref,receipt_ref,envelope,envelope_digest,verified_ms) VALUES(?,?,?,?,?)')
        .run(requestRef,receiptRef,envelope,envelopeDigest,now);
      db.prepare("UPDATE request_ledger SET state='RECEIPTED',updated_ms=? " +
        'WHERE request_ref=?').run(now,requestRef);
      db.exec('COMMIT');
      return Object.freeze({state:'RECEIPTED',replay:false,receiptRef});
    } catch(error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function readRequest(requestRef) {
    ref(requestRef,'request_ref');
    const r=db.prepare('SELECT q.request_ref,q.intent_digest,q.state,e.receipt_ref,'+
      'e.envelope_digest FROM request_ledger q LEFT JOIN river_receipts e '+
      'ON q.request_ref=e.request_ref WHERE q.request_ref=?').get(requestRef);
    return r ? Object.freeze({
      requestRef:r.request_ref,intentDigest:r.intent_digest,state:r.state,
      receiptRef:r.receipt_ref??null,envelopeDigest:r.envelope_digest??null
    }) : null;
  }
  return Object.freeze({
    bindNonce,claimRequest,markException,commitVerifiedReceipt,readRequest,
    close(){db.close();}
  });
}
