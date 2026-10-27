# Influencers Door — R0.4 synthetic governed campaign gateway

Status: **synthetic backend conformance slice only; no live authorization or production deployment**.

## Relationship continuity

This is an incremental change to the existing Creators Door/Influencers Door recovery branch. It preserves:

- One DigitalMe Actor as identity principal; Creator and Influencer are separately issued role entitlements.
- A persistent Brand–Creator Relationship Account, shared by successive campaigns.
- Independent Campaign and Work Package references.
- Creator-owned works unless signed, scoped licences confer stated rights.
- The existing VSR/Creators Common user-facing Door with BNR registry, Warden authority, Synnergyze orchestration, RiverOS evidence and SILK settlement obligations as separate services.

No new entity, registry, wallet, settlement provider or independent identity system is created.

## Implementation files

- `runtime/influencer-campaign-gateway.js`: Node-only, injected-adapter synthetic campaign submission gateway.
- `runtime/influencer-campaign-gateway.test.js`: denial, replay, authorization, evidence and exception tests.
- `.github/workflows/influencers-governed-runtime.yml`: syntax/tests/build guard and static-bundle isolation.
- `src/influencers.js`: preserved R0.3 read-only, synthetic front end.

### Controlled submission contract

The gateway accepts only:

`requestRef`, `sessionRef`, `relationshipRef`, `campaignRef`,
`workPackageRef`, `submissionRef`, and `contentDigest` (sha256).

No browser-supplied `actorRef`, `authorized`, `role`, `actionToken`, payment flag, Warden decision, or evidence receipt can be passed as an input. Context must be resolved server-side by adapters.

Sequence:

1. **DigitalMe** resolves a synthetic active session and acting capacity.
2. **BNR** supplies a synthetic active, campaign-scoped capability entitlement.
3. **Warden** evaluates a synthetic request, then its verifier checks decision scope, authenticated issuer, expiry and revocation status.
4. **RiverOS** reserves a synthetic evidence slot bound to the request and decision.
5. **Warden** is checked again at execution time.
6. **Synnergyze** simulates execution only after the verified reservation.
7. **RiverOS** records a synthetic receipt bound to execution and request.

The gateway returns `SYNTHETIC_RECEIPT_RECORDED` only when all synthetic checks succeed. It returns `DENIED` for pre-reservation errors and `EXCEPTION` with `requiresReconciliation: true` when a reservation or execution may have occurred but the receipt cannot be trusted.

### Replay safety

Same request ID + same canonical payload returns the memoized result. Same request ID + different payload is rejected. **This only uses an in-memory map** and is not safe across processes, restarts or distributed workers. Production requires transactional outbox, server-signed action tokens, durable deduplication and evidence reconciliation.

### Unsupported assumptions

The injected test providers return `synthetic:true` values and a synthetic Warden verification object. None of these adapters establish live issuer trust, signature validation, authoritative current consent, independently certified device security, or verified external effect. The gateway does not execute genuine Warden/RiverOS/Synnergyze connectors. A mocked `verified:true` in a test is never a basis for a real-world grant.

### Production barriers — explicit

- No enabled Express endpoint, MCP tool, network ingress, web route or browser call invokes this gateway.
- No real identity tokens, social credentials, publishing rights or third-party channel permissions.
- No audience scraping, invisible tracking, paid promotion, content publication or payments.
- No actor provisioning, policy issuance or role elevation from frontend selections.
- No user-provided adapter, verification proof or secret may cross the browser/server trust boundary.

### Integration tasks before any pilot with actual participants

1. Define backend API and validation schema with authenticated sessions, CSRF protection where applicable, rate limits, tenant isolation and per-request correlation IDs.
2. Bind BNR authority and Warden signed decisions to identity, representation, work package, purpose, valid times and revocation status.
3. Bind RiverOS durable reservation, write-ahead evidence and reconciliation to immutable event IDs, idempotency keys and receipt signatures.
4. Restrict Synnergyze to approved scoped actions and independently verifiable downstream effects.
5. Implement content IP licences, advertising disclosures, channel publish permissions and a rights-revocation path.
6. Treat SILK as a distinct authorized financial workflow; do not equate invoice creation with verified settlement.
7. Run adversarial tests, reliability and recovery tests, reviewer approval and independent end-to-end certification.

## Tests

`npm run check && npm test && npm run build`

Checks include denial of inactive identity, missing entitlements, Warden DENY/revoked/expired/mismatched scope, missing or inconsistent River reservation, authority revocation between reservation and execution, downstream failures, no private error leakage, idempotent concurrent requests, replay conflict and rejection of non-synthetic outcomes.

CI also confirms `dist/runtime/` is absent. The static Creators Door is still the R0.3 preview; the backend conformance gateway is deliberately unexposed.

## Branch/review sequence

This R0.4 branch is based on R0.3 commit `e7742326b743aba0aab3b83675036c3cbb0d4267`. Review and merge R0.3 into `genesis` only after its own gates are fulfilled. Review R0.4 as a dependent PR, then promote to `genesis` after confirmation. Never promote either branch automatically to `main`; production release remains independently gated.
