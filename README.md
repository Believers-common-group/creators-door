# Creators Door

A mobile-first Virtual Silk Road Door for product showcase, creator participation and market outreach.

## Experience

1. Discover a verified Door.
2. Touch and hold the Warden seal.
3. Verify DigitalMe identity, consent, role and active Arc context.
4. Open layered glass panels into a volumetric light threshold.
5. Enter the Arc workspace.
6. Access activity, tasks, assets, DigitalMe Actors, Creator Studio, documents, payments and analytics.
7. Select a participation role and record the event through the RiverOS integration seam.

## Run

```bash
npm run dev
```

Open `http://localhost:4173`.

## Verify and build

```bash
npm run check
npm run build
```

## Current boundary

This is an interactive front-end prototype. Warden verification and RiverOS evidence are represented through mock adapters and browser events. Live identity, registry, evidence and settlement services must be connected without changing the governed interaction sequence.

## Optional governed observation gateway (R0.5, off by default)

The browser demo remains static, synthetic and non-authoritative. `npm run gateway:dev`
starts a **localhost-only** backend with a `GET /api/influencers/status`
endpoint and `POST /api/influencers/observe` for **read-only**
DigitalMe -> BNR -> Warden -> River observation verification. No publishing,
campaign writes, social credentials, invoicing or SILK settlement.

The gateway requires independently provisioned server-side configuration and
a trusted DigitalMe OIDC JWT with DigitalMe Actor and principal claims.
The existing DigitalMe cookie session is **not** interchangeable with
an OIDC token; issuer/JWKS bridging is not implemented by this repository.
The BNR verify URL is a **proposed internal adapter**, not a verified
existing deployed endpoint. The Warden RETURN-PATH API path is based on
existing repository contracts, but the influencer observation capability
has **not** been verified as admitted. The backend denies when any
component is absent.

See `docs/INFLUENCERS_DOOR_INTEGRATION_R0_5.md` for all required contracts,
test instructions, security and promotion restrictions.
