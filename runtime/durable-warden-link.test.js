// End-to-end synthetic binding of R0.5 Warden to R0.6 SQLite nonce ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {openDurableCampaignLedger} from './durable-campaign-ledger.js';
import {createSignedWardenConformanceAdapter,signingInput} from './signed-warden-conformance.js';

const NOW='2026-10-28T10:00:00.000Z';
const LATER='2026-10-28T10:10:00.000Z';

function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'vsr-warden-ledger-'));
  const path=join(dir,'nonce.sqlite');
  const ledger=openDurableCampaignLedger(path);
  const pair=generateKeyPairSync('ed25519');
  const base={
    action:'campaign.submission.record',
    actingCapacityRef:'CAPACITY:INFLUENCER',
    actorRef:'ACTOR:001',
    audience:'VSR:INFLUENCERS:LAB',
    campaignRef:'CMP:001',
    contentDigest:'sha256:'+'b'.repeat(64),
    decision:'ALLOW',
    decisionRef:'WARDEN:DEC:001',
    issuedAt:NOW,
    issuer:'WARDEN:LAB:001',
    nonce:'NONCE:DURABLE:001',
    relationshipRef:'REL:001',
    requestRef:'REQ:001',
    validUntil:LATER,
    version:'GWD-1',
    workPackageRef:'WORK:001'
  };
  const source=claims=>({
    synthetic:true,
    ...Object.fromEntries([
      'action','actingCapacityRef','actorRef','campaignRef','contentDigest',
      'decision','decisionRef','relationshipRef','requestRef','validUntil','workPackageRef'
    ].map(k=>[k,claims[k]])),
    authorizationEnvelope:{
      version:'GWD-1',
      algorithm:'Ed25519',
      keyId:'WARDEN:KEY:LAB',
      claims,
      signature:sign(null,signingInput(claims),pair.privateKey).toString('base64url')
    }
  });
  const intent=Object.fromEntries([
    'action','actingCapacityRef','actorRef','campaignRef','contentDigest',
    'relationshipRef','requestRef','workPackageRef'
  ].map(k=>[k,base[k]]));
  const createAdapter=db=>createSignedWardenConformanceAdapter({
    decisionSource:{async decide(i){return source(base)}},
    trustedKeys:{
      'WARDEN:KEY:LAB':{
        issuer:'WARDEN:LAB:001',
        publicKey:pair.publicKey.export({type:'spki',format:'pem'})
      }
    },
    audience:'VSR:INFLUENCERS:LAB',
    isRevoked:async()=>false,
    checkNonceBinding:input=>db.bindNonce({
      issuer:input.issuer,
      nonce:input.nonce,
      requestRef:input.requestRef,
      decisionRef:input.decisionRef,
      validUntil:input.validUntil,
      at:input.at
    })
  });
  return {dir,path,ledger,base,source,intent,createAdapter,
    close(){try{ledger.close()}catch{} rmSync(dir,{recursive:true,force:true})}};
}

test('signed Warden nonce binding persists across restart and remains idempotent',async()=>{
  const f=fixture();
  try{
    const a=f.createAdapter(f.ledger);
    const decision=f.source(f.base);
    assert.equal((await a.verifyDecision({decision,intent:f.intent,at:NOW})).verified,true);
    f.ledger.close();
    const reopened=openDurableCampaignLedger(f.path);
    try{
      const b=f.createAdapter(reopened);
      assert.equal((await b.verifyDecision({decision,intent:f.intent,at:NOW})).verified,true);
      const updated={...f.base,requestRef:'REQ:002',decisionRef:'WARDEN:DEC:002'};
      const reused=f.source(updated);
      const intent={...f.intent,requestRef:'REQ:002'};
      assert.equal((await b.verifyDecision({decision:reused,intent,at:NOW})).verified,false);
    }finally{reopened.close()}
  }finally{f.close()}
});

test('unavailable nonce ledger denies a validly signed Warden decision',async()=>{
  const f=fixture();
  try{
    f.ledger.close();
    const a=f.createAdapter(f.ledger);
    const decision=f.source(f.base);
    assert.equal((await a.verifyDecision({decision,intent:f.intent,at:NOW})).verified,false);
  }finally{f.close()}
});
