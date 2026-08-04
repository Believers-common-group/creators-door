# Creators Door architecture

## Runtime flow

DigitalMe Actor → Warden consent and authority check → Door verification → Arc access → RiverOS evidence event → Sentinel Clock lifecycle timestamp.

The prototype uses a mock Warden decision and writes evidence events to the browser console. Production adapters must preserve this sequence while replacing mock state with governed services.

## UI state machine

`idle → verifying → opening → open → entered → participation`

The Door does not open until the verification transition completes. Reduced-motion users receive the same state progression with shortened visual delays.

## Integration seams

- **Identity:** DigitalMe Actor, represented principal and active organisation/Arc.
- **Authority:** Warden decision with role, consent, scope and expiry.
- **Evidence:** RiverOS event append after verification, entry and participation.
- **Lifecycle:** Sentinel Clock creation, effective, review, expiry and revocation timestamps.
- **Content:** product records, creator assets, stories, campaign packages and approvals.
