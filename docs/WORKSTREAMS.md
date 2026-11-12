# CONSPACE / Three-chat parallel delivery

## Fixed base

- Repo: https://github.com/hoanglamvu04/conspace
- Integration base: `bootstrap/gate1-base` (not `main`, which still represents an older TSX concept).
- Worker branches **already prepared**: `work/backend`, `work/frontend`, `work/ops`. Each starts from the identical Gate 1 baseline.
- Runtime: Node.js 22.23.2, npm, React/Vite/JSX, Express, PostgreSQL 16/PostGIS 3.4.2.
- VPS 103.149.170.146, domain https://conspace.vn, API bound to 127.0.0.1:5088, PostgreSQL database `conspace` and role `conspace_app`.
- Production currently displays the Gate 0 holding page. Do not change Nginx, SSL or other applications until reviewed.

## Single ownership rule (NO simultaneous edits to the same files)

| Chat | Branch | Owns | Cannot change |
|---|---|---|---|
| Backend | work/backend | backend/** | frontend/**, ops/**, root files |
| Frontend | work/frontend | frontend/** | backend/**, ops/**, root files |
| Ops | work/ops | ops/**, .github/workflows/** | backend/**, frontend/**, root files |

Only the integrator changes `docs/API_CONTRACT.md`, root `package.json`, `.nvmrc`, and merges PRs. Workers may add notes as `backend/docs/*`, `frontend/docs/*`, `ops/docs/*`; propose shared contract changes through their PR descriptions. No pushing directly to `main` or another worker's branch.

## Backend sprint 1

- Preserve `GET /api/health` and `GET /api/ready` response contract.
- Add versioned public read APIs and migrations for a real taxonomy and published editorial articles as specified in docs/API_CONTRACT.md.
- Start with 8 documented design categories; do not invent the complete 30 specialist contractor niches. Seed them only from approved source data.
- No placeholder fake post counts, fabricated people, fabricated article bodies, or hardcoded production metrics.
- Keep parameterized PostgreSQL queries, distinct `conspace` schema/role, fail-closed validation, error middleware, migrations and tests. Avoid changing existing Hola Maps/X-HUB databases.
- Deliver PR to `bootstrap/gate1-base` with endpoints and test output.

## Frontend sprint 1

- Preserve React + Vite **JSX only**.
- Build responsive public navigation and layouts for 3 reading roles (homeowner, architect, contractor), directory of niches, editorial articles, professional dictionary and proper empty/loading/error states.
- Fetch `/api/v1/...` from same origin according to docs/API_CONTRACT.md. API may not yet be merged; tolerate network/API absence gracefully and do not substitute invented live statistics.
- Do not implement fake authentication or publish-button functionality with no backend.
- Deliver PR to `bootstrap/gate1-base` with build output and screenshots.

## Ops sprint 1

- Audit the existing Nginx HTTPS vhost and currently online PM2 process list. Do not use `pm2 update`, `pm2 kill`, `pm2 restart all`, `systemctl restart nginx` or VPS reboot.
- Complete an idempotent, reviewable deploy/rollback plan that preserves `/__infra/health`, TLS and other sites.
- Ensure DB credentials live exclusively in backend/.env (ignored from Git), API binds loopback and Nginx proxies /api, React dist serves /.
- Confirm PM2 dump contains `x-hub-api` (was previously absent); backup dump and validate before any `pm2 save`.
- Do not switch the live site until Backend + Frontend have passed tests on the integration branch.
- Deliver PR to `bootstrap/gate1-base` with ops test results, no real secrets.

## Integration and acceptance

1. Review backend PR and merge into `bootstrap/gate1-base`.
2. Rebase/merge base into frontend branch, resolve API contract mismatches, review and merge frontend PR.
3. Integrate ops PR, run checks, review deploy plan and stage changes.
4. Verify build, backend tests, database readiness, PM2 isolated app, HTTPS API, UI and no regressions in existing websites.
5. Merge integration branch to main only after owner review; deploy manually under Ops control.

Avoid three chats all modifying `main` or the live VPS simultaneously.
