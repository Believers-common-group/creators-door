# Influencers Door R0.5 — Signed Warden authorization (synthetic conformance)

Status: **cryptographic verification code and automated tests only; NOT live authority or a production rollout**.

## Delivery

R0.5 builds on the already isolated R0.4 campaign gateway. It adds `runtime/signed-warden-conformance.js`, a server-side Ed25519 verifier for a strictly serialized, string-only Warden decision envelope. This is a separate implementation from existing Synnergyze synthetic Warden and River services: no live cross-repository connector is wired or implied.

An R0.5 decision must bind:

- Version `GWD-1`, issuer, trusted key ID and audience `VSR:INFLUENCERS:LAB` (example only).
- Decision `ALLOW`, decision reference, issuance timestamp and expiry.
- Unique nonce, request reference and exact action `campaign.submission.record`.
- DigitalMe actor and acting-capacity references, relationship, campaign and work-package references, plus SHA-256 content digest.

The domain-separated signing input is `GENESIS-WARDEN-DECISION/GWD-1\n` plus a canonical JSON serialization of exactly sixteen flat string claims. Additional claims, non-strings, unsigned mutable fields and malformed signatures fail.

## Verification

The adapter **must** receive backend-configured trusted Ed25519 public keys keyed by `keyId` with issuer identities, an issuer-authoritative revocation check, and a request/decision-scoped nonce-binding service. Trust roots are not accepted from any browser request or from the signed envelope. All conditions are checked on every invocation:

1. Cryptographic Ed25519 signature over canonical claims.
2. Trusted key and issuer; correct audience and version.
3. Exact identity, action, relationship, campaign, work package, request and content binding.
4. Decision and signed claim correspondence.
5. Issued-at not in the future, validity still active, and validity no longer than 15 minutes.
6. Revocation response is explicitly `false`; unknown/errored response denies.
7. Nonce-binding response is explicitly `true`; unknown/errored response denies.

For repeated checks of the **same** request and decision, the nonce service must accept the same binding idempotently. For a different request with the same issuer+nonce it must deny. This MUST use a durable atomic storage implementation, with expiry policy, in real deployments; the tests implement an in-memory mock only.

The R0.4 gateway checks the authorization twice: before River reservation and immediately before Synnergyze execution. A policy reversal between checks prevents execution and causes a post-reservation exception requiring reconciliation.

## Security limitations

- A trusted public key verifies signature origin but does **not** establish the real-world authority of the issuer; deployment requires formal trust onboarding and scoped issuer entitlements.
- **No real BNR/DigitalMe/Warden/Synnergyze/River/SILK provider** has been attached. Tests use generated ephemeral keypairs and synthetic records.
- The Node runtime is unexposed to the browser; no network endpoint or bearer-credential intake is provided.
- This version does not implement durable idempotency, independent receipt signature verification, multi-node nonce storage, live revocation sources, operational audit sinks, incident response or authorized publication.
- Real commercial campaign enrollment, social-network posting, rights licensing and financial settlement remain disabled.
- Do not place signing private keys, session material, secrets or real personal data in GitHub or in browser assets.

## Manual checks

```
npm run check
npm test
npm run build
```

CI ensures this verifier and its tests are **not** copied into the public static bundle.

## Delivery chain

R0.3: <https://github.com/Believers-common-group/creators-door/pull/2>  
R0.4: <https://github.com/Believers-common-group/creators-door/pull/3>

R0.5 branches from R0.4 and targets R0.4 for review. Promote R0.3 → genesis only after independent review. Subsequently promote R0.4 then R0.5 through explicit reviews, conflict checks, permissions tests, source-of-truth verification and release gates. `main` remains unchanged.

## Next milestone — R0.6

Independent persistent nonce and request ledger, trusted issuer onboarding, signed RiverOS receipt verification, separation of duties and adverse test suite. These changes require an authenticated backend and clearly identified legal authority; do not connect operational accounts by default.
