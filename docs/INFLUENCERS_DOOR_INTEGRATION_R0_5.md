# Influencers Door — Connected Gateway Contract R0.5

Status: **source-wired / validation required / not deployed / not admitted for live use**.

This extends the R0.3 preview and R0.4 synthetic conformance runtime. The new `gateway/` directory is a server-only boundary. It must not be copied into the browser or the static `dist/` bundle.

## Verified source boundaries (28 October 2026)

- DigitalMe: `Believers-common-group/DigitalMe` describes `GET /api/auth/me` as cookie-session authentication. Its present source does **not establish** the OIDC JWT bridge used by this proposed gateway. DigitalMe actor, represented principal and session issuance therefore require a separately approved integration before a live request can succeed.
- Warden RETURN-PATH: `Believers-common-group/alpha-warden-admission-core/src/return-path.mjs` uses `/api/v1/warden/capabilities/admissions`, `/authorize`, and `/decisions/:id` for admission and decisions with River receipt. Existing local admission examples admit builder capabilities, not influencer capabilities.
- BNR: `BNR_ENTITLEMENT_VERIFY_URL` is a **proposed adapter contract**, not a confirmed deployed BNR service.
- RiverOS: this slice reads the Warden publisher's `river_receipt_id` via a decision read; it is **not independent cryptographic verification** of an external River receipt.
- Synnergyze: `runtime/influencer-campaign-gateway.js` remains synthetic-only. No actual campaign mutation or posting is enabled.
- PressTech / SILK: explicitly disabled. No channel publish or wallet operation is present.

## Read-only request sequence

```text
VSR Influencers Door browser
   -> POST /api/influencers/observe (same-origin only)
       -> DigitalMe signed session validator (server-side)
       -> BNR membership + campaign entitlement (server-side)
       -> Warden capability admissions lookup
       -> Warden OBSERVE authorization request
       -> Warden decision GET: matching ALLOW + River receipt reference
       -> return limited observation authorization references
```

The only requested capability is `influencers.campaign.observe`. It is `action_class=OBSERVE`, `execution_plane=ALPHA_LOCAL`, and `external_effects=false`. This is **not** a permit to read a campaign's private data or activate a new actor role. The observation response is a gate result only.

## Required proof fields (proposed, not deployed)

The signed DigitalMe token must bind `sub`, `digitalme_actor_id`, `principal_ref`, `acting_capacity_ref` and `represented_organization_ref` to one audience, issuer and expiry. The represented organization claim cannot by itself grant representation: the BNR verification response must corroborate the acting capacity, organization, `membership_ref`, active status, capability, campaign/relationship, Genesis `node_id`, `representation_verified=true`, registry issuer and expiry.

The latest Warden decision read must independently echo the actor principal, capability, work reference, all submitted node/representation/membership/relationship/campaign scope fields, `execution_plane=ALPHA_LOCAL`, `external_effects=false`, a future `valid_until`, and a River receipt reference for **that** decision. If the existing Warden API omits these fields, the adapter **denies** until an approved backend contract or independent verification adapter is supplied. This repository does not change Warden or BNR schemas.

A scope-matched decision does not confer an unrestricted campaign read; further data-level policy and record projection are required.

`DEMO-*` IDs cannot reach the authority chain.

## Proposed server-side configuration

All values must be configured privately for the gateway process. Never commit tokens or transmit them through the front end.

| Variable | Meaning |
| --- | --- |
| `DIGITALME_OIDC_ISSUER` | Trusted issuer expected in signed DigitalMe JWTs; new integration approval needed |
| `DIGITALME_OIDC_AUDIENCE` | Audience binding for this application |
| `DIGITALME_JWKS_URL` | HTTPS public signing key endpoint of the same approved trusted issuer |
| `BNR_ENTITLEMENT_VERIFY_URL` | HTTPS internal membership verification adapter contract; not confirmed implemented |
| `BNR_SERVICE_TOKEN` | Private service-to-service token |
| `WARDEN_RETURN_PATH_URL` | HTTPS-reachable trusted RETURN-PATH endpoint (may require reverse proxy from existing localhost runtime) |
| `WARDEN_SERVICE_TOKEN` | Private service credential |
| `INFLUENCERS_PROVIDER_ID` | Provider ID registered via Warden admission, presently unverified |
| `GENESIS_NODE_ID` | Governed Genesis node ID |
| `GENESIS_PUBLIC_ORIGIN` | Explicit browser origin, e.g. `http://127.0.0.1:4174` only for loopback development |
| `PORT`, `GATEWAY_BIND` | Optional localhost port, bind restricted to loopback |

Until those are independently proven, the local server returns unconfigured / denied.

The local gateway expects a `__Host-vsr_session` cookie containing an issuer-signed RS256 JWT with `sub`, `digitalme_actor_id`, `principal_ref`, `aud`, `iss`, `exp` and optionally `nbf`. It does **not** mint this cookie. Provisioning secure cookies, OIDC issuer trust, session revocation and cross-service identity federation are separate tasks. The legacy DigitalMe cookie cannot be forwarded or reinterpreted as an OIDC token. An HTTPS production proxy is required for `__Host-` cookie semantics and secure transport; loopback testing uses harness-injected fixtures.

## Deny-by-default invariants

1. Unconfigured service, malformed JWT, incorrect signature, audience, issuer or lifetime -> deny.
2. Missing BNR active entitlement, actor/campaign/relationship mismatch or expired membership -> deny before Warden.
3. Capability not explicitly admitted, external-effects false not confirmed, or Warden not ALLOW -> deny.
4. No matching River receipt reference on the latest decision read -> no verified observation result.
5. Browser-supplied Warden decision, actor or other authority fields -> reject. Browser cannot supply upstream service credentials.
6. No implicit Synnergyze execution, publication, invoices, sales, financial settlement or durable River evidence claim.
7. All requests are server-side, no-store, same-origin POST; browser receives only limited IDs, never upstream tokens.
8. Production must add issuer/authentication checks of River receipt signatures, read isolation, revocation enforcement, durable rate limits, audit logs, anti-replay, exact capability scope and policy conformance before use with real participant data.

The Warden capability admission itself is **outside this PR**. Never silently add this permission or modify admission lists as a side effect of serving the UI.

## Run and verify

```bash
npm run check
npm test
npm run build
npm run gateway:dev
```

`npm run gateway:dev` starts a local-only HTTP UI and returns integration status. Without the service contracts, observation requests are blocked. `npm run dev` remains the static preview. For the existing static browser, the Warden animation, River activity, actor roles and campaign data are explicitly labelled as demonstrations rather than authoritative state.

Review GitHub Actions for the concrete test result. No merge, live deployment, network ingress, access policy grant or financial transfer is part of R0.5.

## Next promotion gates

- Implement and independently verify the DigitalMe signed session issuer/bridge (do not mistake `/api/auth/me` for OIDC).
- Implement BNR proof-backed membership and organizational representation verification API; confirm request/response format.
- Register only the approved influencer observation capability in Warden via separate authority review; verify signer trust and receipt binding.
- Add independent River receipt verification and confidentiality controls before any real member/campaign visibility.
- Create separate Warden-admitted EXECUTE workflows for Synnergyze submission; keep PressTech and SILK outside this integration until legal, rights, disclosure and settlement approvals.
- Run end-to-end tests against authorized staging, complete review, then separately decide whether to deploy.
