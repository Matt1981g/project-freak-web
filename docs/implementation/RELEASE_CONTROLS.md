# PROJECT FREAK release controls and recovery boundaries

This runbook documents the pre-publication controls introduced by workflow package 1 of the 11 October 2026 implementation plan. It does not authorise a production database migration.

## Baseline

- Reviewed application: V19.1, commit `894a71b6acf406c22598107150c6a3fa7ab5f0d4`.
- The last known published V19.1 Pages run at that baseline was GitHub Actions run `38124975432`. Its deployment artefact has short retention; retain the source commit as the reproducible frontend recovery point.
- The desktop and iPhone clients have local-first IndexedDB stores. A deployed frontend rollback **does not** undo IndexedDB upgrades, backend migrations, offline outboxes or local work.
- The verified, independently restorable personal-data recovery copy required by package 0 has **not** been supplied or checked from either device. No SQL, auth, sync or IndexedDB migration may use this frontend baseline as a substitute.

## Required pre-publication checks

1. `npm ci` from the committed lockfile.
2. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
3. `npx playwright install --with-deps chromium webkit`, then `npx playwright test` before Pages artefact upload or deploy.
4. Run `scripts/verify-deployment.mjs` against the real deployed URL after publication to verify the entry document, referenced bundles and expected version. This public check cannot prove authenticated sync and must not be represented as such.

A failing required pre-deployment step terminates the Pages build job. Post-deploy smoke remains a distinct gate to report a bad release; it cannot undo an already published bundle.

## Enforcement limits

- Workflows alone **do not** protect `main` from direct pushes or merges. Configure required status checks on the repository branch ruleset, including the `verify` job, and separately verify that a deliberately failed check prevents merging. The linked GitHub App returned HTTP 403 when reading branch protection; until verified, mark repository-level protection **unconfirmed**.
- GitHub Pages does not currently supply the required configurable `Content-Security-Policy: frame-ancestors` response header through this repository workflow. PF-17 remains an explicitly unimplemented limitation until the hosting/proxy decision and deployed-header test are made.
- Local IndexedDB recovery, cloud auth, cross-account isolation, RPC concurrency and actual iPhone behaviour are outside the scope of the browser-only release checks.
- The separately sourced SheetJS archive needs explicit supply-chain review outside standard npm-registry auditing.

## Rollback and recovery

For a frontend-only failure, inspect the last known-good commit and Actions run, then revert the faulty commit through a reviewed change and rerun the complete pipeline. Keep the previous origin and existing offline data intact. Never clear IndexedDB as a standard troubleshooting step. Backend/IndexedDB schema changes require a separately tested forward-recovery or consistent restore procedure before rollout.

## Subsequent package preconditions

Do not deploy package 3–5 persistence, auth, restore, workout or update lifecycle changes until an offline-safe backup has been quiesced and *restored successfully in an isolated profile*, and an isolated Supabase/staging environment has been used for concurrency, cross-user and failure-injection tests. Package 2 must first freeze identity, conflict, graph, draft, progression, cache and version contracts. Complete these steps in dependency order, not as disconnected issue fixes.
