# Creators Door — Manual-only Pages Release Gate R0.2

**State: PROPOSED, DRAFT, BLOCKED BY DEFAULT. NO DEPLOYMENT.**

This PR is based on `feat/github-release-control-r0-1` and must be independently reviewed after [PR #6](https://github.com/Believers-common-group/creators-door/pull/6). It changes only the release workflow and adds preflight validation, tests and this runbook.

## Verified repository situation before changes

- Public `Believers-common-group/creators-door` repository.
- Default branch `main`, integration branch `genesis`.
- `main` reported `protected:false`; no repository rulesets were returned.
- Existing `.github/workflows/pages.yml` deployed on any push to `main`; `workflow_dispatch` also enabled.
- The current public static site includes simulated Warden authority and console-based RiverOS events. It is a prototype; neither interface text nor GitHub Pages means genuine Warden approval or financial authorization.
- R0.1 generates a SHA-256 manifest with `deployEligible:false`. This is an intentionally non-authorizing artifact.
- GitHub Pages environment review settings could not be independently read with available repository connector access; do not assume review protection is configured.

## R0.2 proposed controls

1. Remove the automatic `push` trigger from the Pages deployment workflow. Publication is entered only through an explicit `workflow_dispatch` invoked on `main`.
2. Record an exact 40-character source commit SHA, a BNR release reference and explicit public-prototype acknowledgement.
3. Validate source, build an exact browser allowlist, run regression tests and generate the release-manifest from that exact checked-out commit.
4. Reject publication when source SHA, branch, event, release classification, reference, acknowledgement, manifest inventory, content digest or Warden/RiverOS mock boundary does not match.
5. Reject the current manifest unconditionally because `deployEligible:false`. There is no authorized production release in this PR; a separately reviewed release policy would be needed to permit publication.
6. Grant `pages:write` and `id-token:write` to the deployment job only, after validation, not to build and review jobs.
7. Request the existing `github-pages` environment before Pages publishing. Actual reviewer and branch restrictions must be configured in GitHub repository settings; this workflow **does not create or verify those settings**.

## GitHub UI governance checklist (requires explicit repository-admin action)

1. In **Settings → Rules → Rulesets** (or supported branch protection UI), protect `main` with PR review, passing required status checks, no force pushes and restricted bypass. Check plan-specific availability before relying on rules.
2. In **Settings → Environments → github-pages**, restrict deployments to the protected `main` branch, require a suitable human reviewer, and disallow self-review where supported.
3. Confirm whether org-level policies, GitHub Pages configuration and environment/reviewer protections are effectively enforced; check bypass permissions and repository admin privileges.
4. Ensure the pages workflow is the only production publisher and inspect existing Actions configurations, personal access tokens, webhooks and external deployment paths.
5. Verify commit provenance, status checks, approval identity, legal release classification and rollback authority before any publication policy change.
6. Confirm all required reviewers have access and no plan/organization rule leaves a bypass path.

These are **not yet configured**, and therefore cannot be claimed as protection.

## Fail-closed review and acceptance

Workflow: `.github/workflows/pages-release-gate-review.yml` has only read access and cannot deploy. It runs on R0.2 branch and relevant PRs. Its tests prove:
- A push or pull_request event cannot pass the publishing preflight.
- Only the exact SHA of `main` may be proposed, with correctly shaped release reference and explicit prototype acknowledgement.
- A changed/unknown asset inventory, nonmatching manifest or tampered release classification is rejected.
- The R0.1 manifest is still **ineligible**; the publishing workflow remains unable to deploy under the proposed controls.
- No docs, tests or server-side runtime are copied into the browser bundle.

**No successful test of the R0.2 gate implies production readiness or a verified human approval.** The `PRECHECK_PASSED` result only means input and manifest metadata passed; it explicitly returns `humanReviewProven:false` and `authorityGranted:false`.

## Review / rollback

Review this PR against R0.1. After independent approval and verification of the matching GitHub settings, promoting R0.1 → `genesis` and then R0.2 → `genesis` is a separate human-controlled action. Release to `main` requires its own PR and review. No merge is performed here.

Rollback of the proposed workflow, if later merged, requires an authorized new commit/PR restoring the last reviewed configuration. Do not re-enable the old automatic `push` deployment as an emergency shortcut; approved manual static publication or a known-safe artifact is preferable.

## Separate future work

GitHub is the source, package/build and release-control plane. BNR remains membership/legal authorization, Warden remains consent and policy, Synnergyze coordinates execution and RiverOS stores authoritative evidence. This workflow is not a replacement for any of these systems.

Production backend requires a trusted service runtime with persistent data, authenticated identity and independent receipts. Pages only serves the public/static experience.
