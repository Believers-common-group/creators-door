# Influencers Door — Continuity Recovery R0.3

Status: **implementation preview; not approved for production**

## Scope

Restore the existing Influencers Door commercial-account projection inside Creators Door and VSR. Do not create a separate identity authority, payments provider, public registry, or independent fork of the Creator ecosystem.

- **DigitalMe:** identity principal and represented capacity, to be verified by a trusted identity service.
- **BNR:** source of membership and service entitlement, never inferred from a front-end role selection.
- **Warden:** consent, policy, representation and signed time-bound authorization; authorization cannot be self-asserted by an AI agent or browser.
- **Synnergyze:** relationship, work-package and execution coordination after valid authority.
- **RiverOS:** durable evidence, submission, decision, attribution and dispute references through governed backend; browser console events are not evidence receipts.
- **PressTech:** distribution connector only when the publisher grants scoped authority.
- **SILK:** financial obligation and settlement reconciliation, distinct from UI payment status.
- **VSR / Creators Common:** discoverability, communication, creator rights and the role-specific Door projection.

## Account hierarchy

```text
DigitalMe Actor (principal and acting capacity)
  -> Creator / Influencer role entitlement (BNR / Warden)
    -> Brand–Creator Relationship Account (persistent)
      -> Campaign (time-bounded terms and objectives)
        -> Work Package (deliverables, rights, disclosure and approval)
          -> Distribution submission (channel-bound)
            -> RiverOS receipts (verified independently)
              -> Acceptance, reconciliation and disputes
```

A relationship must not disappear when one campaign closes. Multiple campaigns can reference one relationship. No campaign inherits copyright, profile access, posting rights, or settlement authority by default.

## R0.3 implementation boundary

`src/influencers.js` supplies two synthetic campaigns under one synthetic relationship, a read-only view, and the `checkTransition` validation helper. The UI never mutates live campaigns. Its reference-presence gate does not verify documents, signatures, participants, issuer, expiry, revocation or financial settlement and **must not be used as the production policy decision point**.

The preview entry appears on the current Creators Door home screen. Neither `main` nor the existing `genesis` branch is changed by this feature branch until explicitly reviewed and merged.

## Transition contracts

| From | To | Minimum required references |
| --- | --- | --- |
| draft | briefed | Brief reference |
| briefed | authorized | Contract, creator consent, IP licence, disclosure plan, Warden decision and ALLOW |
| authorized | delivered | Work package and submission receipt |
| delivered | accepted | Independent reviewer acceptance |
| accepted | reconciled | Invoice and independent settlement receipt |
| reconciled | closed | Closeout evidence |

A real service must validate every reference against the authoritative issuer, including revocation and time limits. Deny by default for unmatched transitions. No implicit granting by UI state.

## Privacy and rights

Never scrape social-account credentials, private messages, lists of followers or private analytics without express permission. No transferable content licence without a contract. A campaign may be paid, donated or unpaid only as specifically agreed; disclose sponsorship and commercial relationships under applicable rules.

## Test and acceptance

- Run `npm run check` and `npm run build`.
- Confirm both campaigns share one relationship.
- Ensure cross-step transition and missing authorization references are denied.
- Ensure reconciliation cannot pass without an independent settlement receipt.
- Verify UI visibly labels all records as synthetic.
- Verify existing Creators Door routes, door animation and participation sequence remain functional.
- Obtain governance and security review before any live actor, API, real receipt, channel token or wallet connection.

## Promotion

Branch: `feat/influencers-door-r0-3`, based on `genesis`.

Promotion requires a reviewed PR into `genesis`, verified checks, approval for affected contracts, and only then a separate normal release decision. No production publication or service activation is part of this recovery.
