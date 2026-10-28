# Genesis Synthetic Baseline R0.2 — Creators Door consumer test

**Status:** Test-only, proposed. Does not create a Creators Door user, licence or campaign permission.

## Source of truth

The GitHub Actions workflow checks out `Esomoire-consultancy-Company/genesis-ark` at immutable commit `00591414a979872e29c005e6e2a6784eaf66c45e` under the temporary CI folder `_synthetic_reference/`. It verifies `synthetic-baseline/fixture-lock.json` against the exact bytes of `fixtures.json` and `scenarios.json`. The reference is read-only and is not stored or shipped in the Creators Door build.

## Why only denial tests?

Genesis R0.2 defines `creator.draft.synthetic`, `subscription.quote.synthetic` and other intentionally restricted fictional capabilities. Creators Door's governed campaign submission action is **`campaign.submission.record`**. No Genesis R0.2 test licence includes that action.

An adapter that silently converted `creator.draft.synthetic` into `campaign.submission.record` would be an **unauthorised capability escalation**. This test therefore explicitly proves:
- An active fictional creator with a valid `creator.draft.synthetic` licence is denied for a campaign submission.
- A revoked Commons membership is denied before Warden, River or execution.
- A disabled synthetic identity is denied before entitlement resolution.
- The Genesis fixture's review-required operator promotion action is not treated as a campaign permission.
- Test licences and runtime gateway code are absent from the public static build.

## Execution

The immutable reference fixture is checked out by CI. From a development checkout where `_synthetic_reference/synthetic-baseline/` holds that exact version:

```sh
node --test runtime/genesis-baseline-contract.test.js
```

No real DigitalMe/OIDC session, BNR membership, financial settlement, Warden execution grant or RiverOS operational receipt is created.

## Admission gate for a future allowed campaign action

A separate reviewed contract must define a new **synthetic-only campaign-submission capability**, its actor type, explicit work/campaign scopes, consent/representation chain and Warden validation. It must never promote a synthetic outcome into real authority. Only then may a positive campaign-action scenario be introduced. This PR does not modify production code.

## Branching

The proposed PR targets `feat/influencers-door-r0-3`; it is not intended for direct promotion to `main`. Keep it draft until both this consumer PR and the Genesis R0.2 baseline PR are reviewed.
