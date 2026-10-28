# Influencers Door R0.6 — Persistent nonce ledger and signed River evidence

**Status:** isolated, server-side laboratory conformance implementation. **Not production-ready or deployed.**

## Continuity and purpose

R0.6 extends the existing R0.3 account projection, R0.4 synthetic campaign gateway and R0.5 signed Warden conformance. It is a bounded proof of durable control over authorization nonce bindings, request claims and independently signed evidence receipts. It does **not** provision members, activate influencer accounts, publish to social networks, or execute SILK settlement.

The persistent relationship and individual campaign/work package hierarchy remain unchanged.

## Files

- `runtime/durable-campaign-ledger.js`: SQLite-backed, single-host request, nonce and evidence ledger with WAL, `synchronous=FULL`, primary keys, uniqueness constraints and transactional receipt commits.
- `runtime/verified-river-receipt.js`: independent Ed25519 receipt verifier with pinned issuer keys and domain-separated, canonical, fixed flat-claim serialization.
- `runtime/durable-evidence.test.js`: restart, conflict, signature tampering, scope checks, receipt replay and exception recovery tests.
- `runtime/durable-warden-link.test.js`: R0.5 signed Warden decision using R0.6 persistent nonce service, including collision and unavailable-ledger denial.
- `.github/workflows/influencers-durable-evidence.yml`: Node 22 syntax, tests, build and server-code isolation.

## Durable ledger semantics

Tables: `nonce_bindings`, `request_ledger`, `river_receipts`.

- The unique key `(issuer,nonce)` binds a nonce immutably to exactly one Warden request and decision. A repeat of the identical binding succeeds, a collision fails, and expired nonces are never reissued.
- The unique `request_ref` binds a submission attempt to a canonical SHA-256 intent fingerprint. Reusing the same request reference with a different fingerprint fails. An identical repeat returns its current persisted state.
- States: `PENDING`, `EXCEPTION`, `RECEIPTED`. `PENDING` after a crash is **not** an invitation to re-run the effect. An `EXCEPTION` also requires evidence reconciliation.
- The verified receipt and terminal state are committed in one SQLite `BEGIN IMMEDIATE` transaction. Exact identical receipts replay idempotently; changed receipts for the same request are rejected.
- Ledger state remains after close/reopen on an unchanged filesystem. WAL + `FULL` provides local crash-resilience assumptions, **not** automatic network durability, replication, backups or exactly-once remote delivery.
- Database access is trusted backend code only. The `commitVerifiedReceipt` ledger method is an internal primitive; **never expose it as a route or agent tool**. Receipt verification must occur before invoking it.

## Signed receipt contract GRR-1

The RiverOS evidence verifier requires pinned Ed25519 issuer public keys, key ID and audience. It rejects untrusted keys or issuer mismatch, malformed or extra claims, noncanonical signatures and claims inconsistent with authoritative expected scope.

A verified receipt binds `requestRef`, `campaignRef`, `workPackageRef`, `decisionRef`, `reservationRef`, `executionRef`, `contentDigest`, and `intentDigest` to a signed receipt reference. It checks the persisted request fingerprint before recording the evidence. The acceptance window for newly submitted receipts is 15 minutes from issuance; future-issued receipts are rejected.

`SYNTHETIC_RECEIPT_RECORDED` is a **laboratory status**, never a verified external publication or payment. A genuine RiverOS receipt adapter, authoritative observation and independent operational acceptance must be separately integrated.

## Warden ↔ persistent nonce contract

The earlier R0.5 Warden verifier calls an injected `checkNonceBinding` callback. R0.6 demonstrates that it can be backed by a file-backed SQLite ledger. The test checks that a Warden grant remains verifiable for its same request and decision after a ledger restart, while another signed request trying the same issuer+nonce is refused.

Issuer onboarding, key rotation, revocation reliability, per-tenant scoping and reconciliation of stale grants are **not** yet provided as live services.

## Threat model and limitations

- **Single host and trusted process only.** Node 22 `node:sqlite` requires `--experimental-sqlite` in the test runner. A memory-only or ephemeral container filesystem is not a durable deployment.
- No multi-instance transaction coordinator, remote database, distributed lock, independent replay auditor, backup/restore check, encryption-at-rest key management or disaster recovery.
- No authoritative issuer binding, legal onboarding, device attestation, real Warden decision service or trusted RiverOS signer has been provisioned.
- R0.4's existing in-memory campaign gateway has **not** been changed to drive this ledger. The ledger and receipt recorder remain independent backend building blocks. Wiring them directly into an execution path without durable action-outbox and effect-checkpoint design would create an unsafe double-execution window.
- `expected` receipt scope must be derived by an authenticated backend from retained authoritative intent, never supplied by a web user.
- The receipt verifier allows an issuer signature but cannot independently establish that the issuer observed a real external action; additional verifier/observer separation-of-duties is required.
- No live DigitalMe login, BNR entitlement issuance, campaign publishing, social account credentials or financial transfer.
- The existing static VSR Door remains unchanged, and CI checks that none of these Node runtime modules is packaged into the public site.

## Acceptance gates

1. `npm run check`, `npm test`, `npm run build` pass on Node 22.
2. Atomic nonce uniqueness, idempotence and restart behavior are exercised.
3. A signed Warden grant can use the durable nonce adapter; collisions and outages deny.
4. Signed River receipt detects tampering, issuer mismatch, invalid audience, scope mismatch and lost request.
5. Repeat verified receipts return idempotent results without duplicate rows.
6. Crash states are preserved for reconciliation; no implicit effect re-execution.
7. Runtime code is not present in `dist`.
8. Independent security, identity, deployment, rights and governance review is required before merge.

## Future gate

R0.7 should implement an authenticated backend, persisted canonical intent envelopes, signed event/outbox lifecycle, operator-managed key registry, independent River observation and controlled recovery worker. Deploy only to a persistent, provisioned service after independent acceptance; do not modify production as part of this review.
