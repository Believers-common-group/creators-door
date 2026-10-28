# Creators Door — GitHub Release Control R0.1

**Status:** proposed, review-only. GitHub Actions is the source/build/release-control plane, not the canonical BNR/RiverOS registry or application runtime.

## Existing deployment observed

- Default and public source branch: `main`.
- Integration branch: `genesis` (see `.genesis/branch.yaml`).
- `.github/workflows/pages.yml` currently triggers on **push to main** or manual `workflow_dispatch` and builds/deploys static assets to GitHub Pages.
- `src/main.js` contains **mock Warden** and console-only RiverOS demonstrations. The static user experience is a **prototype**, not an authenticated production execution backend.
- R0.3 through R0.6 Influencers Door features remain under independent review. They must not be silently promoted or treated as released by this change.

## R0.1 changes

1. `scripts/build.mjs` copies only known web runtime files. It does **not** publish `docs/`, `README.md`, tests, `runtime/`, branches, CI configuration, or other repository source. The optional `src/influencers.js` is allowlisted only if present after an independently approved integration.
2. `scripts/verify-release.mjs` requires an exact public-asset inventory. It detects missing/unexpected files and symlinks, verifies basic site assets, and writes `out/release-manifest.json` with per-file SHA-256 and deterministic bundle digest. This artifact is independent of any RiverOS evidence ledger and should be **reconciled into RiverOS only via authorized connectors**.
3. `scripts/verify-release.test.mjs` checks deterministic manifest generation and fail-closed behavior for extra, missing, and symlinked assets.
4. `.github/workflows/release-readiness.yml` runs code checks, build, tests, attestation, and uploads the static preview plus manifest as a short-lived GitHub Actions artifact. It has only `contents:read`; **no Pages, deployment, publish, packages:write, secret, or production environment permissions**.

## Candidate release classification

The manifest explicitly states:
- `classification: PUBLIC_STATIC_PROTOTYPE`
- `deployEligible: false`
- `authority: NONE; Warden/RiverOS remain mock integration seams`

`deployEligible: false` is **metadata**, not an independent GitHub authorization control. The current Pages workflow can still deploy from `main` unless its own workflow is changed or branch/environment rules are enforced. This PR deliberately **does not alter** that existing production workflow. A future separate reviewer-approved PR must add enforceable deployment gates and verify plan-appropriate branch rules.

## Branch promotion contract

`feature/* → PR → genesis → PR → main → separately authorized deployment`.

Before any merge to `genesis`, require passing checks, codeowner/security review and regression checks. Before any `main` promotion, require the accepted service classification, approved Warden/identity/evidence boundaries, supply-chain provenance, durable operational status verification, rollback procedure and named release approver.

When a static *demonstration* site is appropriate, do not label it as a verified account, active wallet, genuine receipt, or production authorization. A real backend/API should be deployed to a separately authenticated, persistent runtime; GitHub Actions/GHCR may build and distribute releases but must not become the identity, ledger or legal registry.

## Merge and release controls still to configure

No repository permission or environment-protection settings were changed in this work. Reviewers must verify plan-dependent protection availability before using GitHub Environment approvals or required status checks, and must enforce control in an authorized repo-policy change. In a non-Enterprise setup, validate which protections are available for the repository visibility and plan.

The new readiness workflow is a **non-deploying candidate-check**. It should not be represented as protecting the existing Pages deployment until an approved change wires the validation and authorization to that publishing path.

## Validation

Run:

```bash
npm run check
npm run build
npm test
npm run verify:release
```

Review the Actions candidate artifact, `out/release-manifest.json`, and the exact source commit it records. Check no server-only or test source is included in `dist/`. Then request human approval for further release configuration. No deployment, GitHub Release, or container push should be performed as part of R0.1.
