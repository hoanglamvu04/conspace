# CONSPACE local-first development (Windows CMD)

This runbook is for local development only. It never deploys to VPS and must not point to conspace.vn or 103.149.170.146.

## Fixed local stack

- Node.js: 22.23.2 (see repository .nvmrc)
- Frontend: http://127.0.0.1:5176
- Backend: http://127.0.0.1:5088
- PostgreSQL/PostGIS: Docker container conspace-db-local on 127.0.0.1:55432
- Database: conspace, role conspace_app

## Start the local database

Open CMD:

    docker start conspace-db-local
    docker exec conspace-db-local pg_isready -U postgres -d postgres

Do not create a second container if this one already exists. Do not delete the Docker volume to fix a migration or login issue.

## Pull and install

    cd /d D:\conspace
    git switch main
    git pull --ff-only origin main
    npm.cmd ci --prefix backend
    npm.cmd ci --prefix frontend

The local backend/.env must use only the loopback database connection. Never copy the VPS .env or secrets into the repository.

## Apply local schema and seed

    npm.cmd run db:migrate --prefix backend
    npm.cmd run db:seed --prefix backend

Migrations are append-only. Never edit a migration that has already been applied locally; add a new numbered migration instead.

## Run services

Terminal 1 — Backend:

    cd /d D:\conspace
    npm.cmd run dev:backend

Terminal 2 — Frontend:

    cd /d D:\conspace
    npm.cmd run dev:frontend

## Local smoke test

With Docker, Backend and Frontend running, open CMD:

    cd /d D:\conspace
    ops\scripts\local-smoke.cmd

The script verifies local frontend routes, health/readiness, anonymous denial for CMS APIs, all three reader-lens feeds, field-note preference, search and source-backed niche sections. It uses no credentials and performs no writes. It rejects non-loopback targets by design.

## Full local acceptance by CMS role

Run this only against the local stack. The acceptance runner refuses non-loopback URLs and never prints passwords or session cookies.

Before every acceptance pass, reset the synthetic workflow fixtures with the demo seed. Choose a local-only demo password of at least 14 characters and keep both passwords inside your own CMD session; do not paste them into chat, commit them, or put them in documentation.

    cd /d D:\conspace
    set DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY
    set DEMO_USER_PASSWORD=YOUR_LOCAL_DEMO_PASSWORD
    npm.cmd run db:seed-demo --prefix backend

Then provide the existing local administrator password and run the acceptance harness:

    set CONSPACE_ADMIN_EMAIL=admin@conspace.local
    set CONSPACE_ADMIN_PASSWORD=YOUR_LOCAL_ADMIN_PASSWORD
    ops\scripts\local-role-acceptance.cmd

The harness verifies:

- login/session/CSRF for ADMIN, Editor, Technical Reviewer and Editor-in-Chief;
- ADMIN-only user management and negative role boundaries;
- Article flow from returned draft to submit, technical review, mandatory chief review, publish, public read, audit history and withdrawal cleanup;
- Field Note compliance readiness, submit, technical review and return-for-changes;
- Q&A answer revision, technical review, chief review, publish, public read and archive cleanup;
- Chapter slot read/write permission with the original title restored after the probe.

It intentionally reuses `[DEMO]` records created by `db:seed-demo`, so rerun the demo seed before each acceptance pass. If your Backend allowlist uses a different local frontend origin, set `CONSPACE_CMS_ORIGIN` to that loopback origin before running the harness.

After the test, clear the password variables from that CMD session if it will remain open:

    set CONSPACE_ADMIN_PASSWORD=
    set DEMO_USER_PASSWORD=

## Test before asking for deployment

    npm.cmd run check --prefix backend
    npm.cmd test --prefix backend
    npm.cmd test --prefix frontend
    npm.cmd run build

Only after local tests, the role acceptance harness and GitHub Actions pass should the owner review a separate production release checklist. Push to main is not permission to deploy. VPS, Nginx, PM2, SSL and other applications remain untouched during local development.

## Public Web read-only acceptance

Start Docker, Backend and Frontend. For a full fixture-based pass, reset the local demo seed first (see the role-acceptance section above), because the role suite withdraws/archives its test fixtures. Then run:

    cd /d D:\conspace
    ops\scripts\public-acceptance.cmd

This read-only script checks 18 public route entry points, three reader feeds, real Template B structure, public books/chapters, search, and publishing isolation. A seeded public Article must be readable; a returned Article, a draft Field Note and a non-published demo Q&A must remain hidden. The runner does not log in, post questions, mutate records or contact production. Browser rendering and actual mobile device behavior still require a separate manual visual walkthrough.
