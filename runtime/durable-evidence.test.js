import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {openDurableCampaignLedger} from './durable-campaign-ledger.js';
import {
  riverReceiptSigningInput, digestIntent, createVerifiedRiverReceiptRecorder
} from './verified-river-receipt.js';

const NOW='2026-10-28T10:00:00.000Z';
const LATER='2026-10-28T10:10:00.000Z';
const INTENT={
  actingCapacityRef:'CAPACITY:INFLUENCER',
  action:'campaign.submission.record',
  actorRef:'ACTOR:001',
  campaignRef:'CMP:001',
  contentDigest:'sha256:'+'a'.repeat(64),
  relationshipRef:'REL:001',
  requestRef:'REQ:001',
  submissionRef:'SUB:001',
  workPackageRef:'WORK:001'
};
const DIGEST=digestIntent(INTENT);
function temporaryLedger() {
  const dir=mkdtempSync(join(tmpdir(),'vsr-r06-'));
  const file=join(dir,'ledger.sqlite');
  const db=openDurableCampaignLedger(file);
  return {db,file,dir,cleanup() {try{db.close()}catch{} rmSync(dir,{recursive:true,force:true})}};
}
function createFixture(overrides={}) {
  const pair=generateKeyPairSync('ed25519');
  const issuer='RIVER:LAB:001';
  const audience='VSR:INFLUENCERS:LAB';
  const keyId='RIVER:KEY:LAB001';
  const claims={
    audience,campaignRef:INTENT.campaignRef,contentDigest:INTENT.contentDigest,
    decisionRef:'WARDEN:DECISION:001',executionRef:'SYN:EXEC:001',
    intentDigest:DIGEST,issuedAt:NOW,issuer,receiptRef:'RIVER:RECEIPT:001',
    requestRef:INTENT.requestRef,reservationRef:'RIVER:RES:001',
    state:'SYNTHETIC_RECEIPT_RECORDED',version:'GRR-1',
    workPackageRef:INTENT.workPackageRef,
    ...(overrides.claims||{})
  };
  const envelope={
    version:'GRR-1',algorithm:'Ed25519',keyId,claims,
    signature:sign(null,riverReceiptSigningInput(claims),pair.privateKey)
      .toString('base64url')
  };
  const expected=Object.fromEntries(
    ['campaignRef','contentDigest','decisionRef','executionRef',
      'intentDigest','requestRef','reservationRef','workPackageRef']
      .map(k=>[k,claims[k]])
  );
  function verifier(db, options={}) {
    return createVerifiedRiverReceiptRecorder({
      ledger:db,
      trustedKeys:{[keyId]:{
        issuer,publicKey:pair.publicKey.export({format:'pem',type:'spki'})
      }},
      audience:options.audience || audience
    });
  }
  return {envelope,expected,pair,claims,verifier};
}
function claimed(db) {
  return db.claimRequest({requestRef:INTENT.requestRef,intentDigest:DIGEST,at:NOW});
}

test('durable request fingerprint is preserved across close and restart',()=>{
  const x=temporaryLedger();
  try{
    assert.deepEqual(claimed(x.db),{created:true,state:'PENDING'});
    assert.deepEqual(claimed(x.db),{created:false,state:'PENDING'});
    x.db.close();
    const reopened=openDurableCampaignLedger(x.file);
    try{
      assert.deepEqual(claimed(reopened),{created:false,state:'PENDING'});
      assert.throws(()=>reopened.claimRequest({
        requestRef:INTENT.requestRef,intentDigest:'sha256:'+'b'.repeat(64),at:NOW
      }),/request_ref_fingerprint_conflict/);
      assert.equal(reopened.readRequest(INTENT.requestRef).state,'PENDING');
    }finally{reopened.close()}
  }finally{x.cleanup()}
});
test('issuer and nonce binding survives restart and denies request collisions',()=>{
  const x=temporaryLedger();
  const binding={
    issuer:'WARDEN:LAB:001',nonce:'NONCE:001',
    requestRef:'REQ:001',decisionRef:'DECISION:001',
    validUntil:LATER,at:NOW
  };
  try{
    assert.equal(x.db.bindNonce(binding),true);
    assert.equal(x.db.bindNonce(binding),true);
    assert.equal(x.db.bindNonce({...binding,requestRef:'REQ:002'}),false);
    x.db.close();
    const reopened=openDurableCampaignLedger(x.file);
    try{
      assert.equal(reopened.bindNonce(binding),true);
      assert.equal(reopened.bindNonce({...binding,decisionRef:'DECISION:002'}),false);
      assert.equal(reopened.bindNonce({...binding,validUntil:'2026-10-28T10:09:00Z'}),false);
      assert.equal(reopened.bindNonce({...binding,at:LATER}),false);
    }finally{reopened.close()}
  }finally{x.cleanup()}
});
test('verified receipt is durable, idempotent and bound to request hash',()=>{
  const x=temporaryLedger(),f=createFixture();
  try{
    claimed(x.db);
    const first=f.verifier(x.db).record({envelope:f.envelope,expected:f.expected,at:NOW});
    assert.deepEqual(first,{
      state:'RECEIPTED',replay:false,receiptRef:'RIVER:RECEIPT:001'
    });
    const replay=f.verifier(x.db).record({envelope:f.envelope,expected:f.expected,at:NOW});
    assert.equal(replay.replay,true);
    x.db.close();
    const reopened=openDurableCampaignLedger(x.file);
    try{
      assert.equal(reopened.readRequest(INTENT.requestRef).state,'RECEIPTED');
      assert.equal(reopened.readRequest(INTENT.requestRef).receiptRef,'RIVER:RECEIPT:001');
      assert.equal(f.verifier(reopened).record({envelope:f.envelope,expected:f.expected,at:NOW}).replay,true);
    }finally{reopened.close()}
  }finally{x.cleanup()}
});
test('tampering with receipt signature, claims and authority refs fails without ledger mutation',()=>{
  const x=temporaryLedger(),f=createFixture();
  try{
    claimed(x.db);
    const mutations=[
      e=>{e.claims.campaignRef='CMP:OTHER'},
      e=>{e.claims.contentDigest='sha256:'+'b'.repeat(64)},
      e=>{e.claims.issuer='RIVER:OTHER'},
      e=>{e.claims.intentDigest='sha256:'+'c'.repeat(64)},
      e=>{e.claims.receiptRef='RIVER:OTHER'},
      e=>{e.algorithm='HS256'},
      e=>{e.keyId='UNKNOWN:KEY'},
      e=>{e.signature='AAAAAAAAAAA'},
      e=>{e.claims.extra='unsigned'}
    ];
    for(const mutate of mutations){
      const bad=structuredClone(f.envelope);
      mutate(bad);
      assert.throws(()=>f.verifier(x.db).record({
        envelope:bad,expected:f.expected,at:NOW
      }));
      assert.equal(x.db.readRequest(INTENT.requestRef).state,'PENDING');
    }
  }finally{x.cleanup()}
});
test('wrong audience, future receipt and stale receipts are refused',()=>{
  const x=temporaryLedger(),f=createFixture();
  try{
    claimed(x.db);
    assert.throws(()=>f.verifier(x.db,{audience:'VSR:OTHER'}).record({
      envelope:f.envelope,expected:f.expected,at:NOW
    }),/river_receipt_scope_invalid/);
    assert.throws(()=>f.verifier(x.db).record({
      envelope:f.envelope,expected:f.expected,at:'2026-10-28T09:59:00Z'
    }),/river_receipt_time_invalid/);
    assert.throws(()=>f.verifier(x.db).record({
      envelope:f.envelope,expected:f.expected,at:'2026-10-28T11:00:00Z'
    }),/river_receipt_time_invalid/);
  }finally{x.cleanup()}
});
test('a request remains EXCEPTION after restart, not automatically executable',()=>{
  const x=temporaryLedger();
  try{
    claimed(x.db);
    assert.equal(x.db.markException({
      requestRef:INTENT.requestRef,intentDigest:DIGEST,at:NOW
    }).state,'EXCEPTION');
    x.db.close();
    const reopened=openDurableCampaignLedger(x.file);
    try{
      assert.deepEqual(claimed(reopened),{created:false,state:'EXCEPTION'});
      assert.equal(reopened.readRequest(INTENT.requestRef).state,'EXCEPTION');
    }finally{reopened.close()}
  }finally{x.cleanup()}
});
test('a verified receipt resolves an EXCEPTION without rerunning side effects',()=>{
  const x=temporaryLedger(),f=createFixture();
  try{
    claimed(x.db);
    x.db.markException({requestRef:INTENT.requestRef,intentDigest:DIGEST,at:NOW});
    const result=f.verifier(x.db).record({envelope:f.envelope,expected:f.expected,at:NOW});
    assert.equal(result.state,'RECEIPTED');
    assert.equal(x.db.readRequest(INTENT.requestRef).state,'RECEIPTED');
  }finally{x.cleanup()}
});
test('no receipt may be attached to an unclaimed or wrongly scoped request',()=>{
  const x=temporaryLedger(),f=createFixture();
  try{
    assert.throws(()=>f.verifier(x.db).record({
      envelope:f.envelope,expected:f.expected,at:NOW
    }),/river_receipt_request_missing_or_mismatched/);
    claimed(x.db);
    assert.throws(()=>f.verifier(x.db).record({
      envelope:f.envelope,expected:{...f.expected,workPackageRef:'WORK:OTHER'},at:NOW
    }),/river_receipt_binding_mismatch/);
  }finally{x.cleanup()}
});
test('two writers cannot claim same ID for different intents',()=>{
  const x=temporaryLedger();
  try{
    const other=openDurableCampaignLedger(x.file);
    try{
      claimed(x.db);
      assert.throws(()=>other.claimRequest({
        requestRef:INTENT.requestRef,intentDigest:'sha256:'+'9'.repeat(64),at:NOW
      }),/request_ref_fingerprint_conflict/);
      assert.equal(other.claimRequest({
        requestRef:INTENT.requestRef,intentDigest:DIGEST,at:NOW
      }).created,false);
    }finally{other.close()}
  }finally{x.cleanup()}
});
