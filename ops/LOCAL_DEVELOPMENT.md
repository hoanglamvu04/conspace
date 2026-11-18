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

## Public Web browser acceptance (real Chromium)

Run this after the local Backend, Frontend and Docker are ready. This test uses real Chrome/Chromium, checks rendered React pages and mobile interactions, and never logs into CMS or submits a public form.

Prepare synthetic fixtures with the **existing local-only demo seed** (no real credentials or production data):

    cd /d D:\conspace
    set DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY
    set DEMO_USER_PASSWORD=YOUR_LOCAL_DEMO_PASSWORD
    npm.cmd run db:seed-demo --prefix backend

Then start Backend and Frontend in separate CMD windows as above. In another CMD window run:

    cd /d D:\conspace
    ops\scripts\public-browser-acceptance.cmd

Chrome or Chromium must be installed. Set CONSPACE_BROWSER_BIN to its executable path only if automatic discovery fails. The test rejects production URLs and performs HTTP GETs only. It verifies the actual DOM at desktop/mobile widths: homepage, published/draft article isolation, Template B, Dictionary, Search facet, anonymous Q&A form, mobile navigation/keyboard and reader preference; it also detects uncaught browser JavaScript exceptions and horizontal mobile overflow. On failure, a local screenshot is written to the temporary browser-artifacts directory.

GitHub Actions runs the same browser acceptance on a clean PostgreSQL service with synthetic [DEMO] seed data and saves a screenshot and service logs as failure-only diagnostic artifacts. This is not a production test or a full visual design approval.

In GitHub Actions the browser fixture uses `DEMO_NICHE_SLUG=luxury` to avoid overwriting the non-demo HOUSE architecture blocks created by integration tests. On a clean local database the default `house` fixture remains supported.

## Full-site synthetic seed (populate Public Web and CMS)

Use this when the public website looks empty. The older db:seed-demo creates a SMALL workflow fixture only; db:seed-demo-full is a separate LOCAL-ONLY command to populate the public reader experience.

Start your existing local Docker PostgreSQL first, run migrations and the documented eight design niches, and then invoke the full seed:

    cd /d D:\conspace
    docker start conspace-db-local
    npm.cmd run db:migrate --prefix backend
    npm.cmd run db:seed --prefix backend
    set "DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY"
    set /p DEMO_USER_PASSWORD=Nhap mat khau demo local (toi thieu 14 ky tu):
    npm.cmd run db:seed-demo-full --prefix backend
    set DEMO_USER_PASSWORD=

This populates all eight documented design areas, up to thirty **explicitly [DEMO] synthetic construction niches** arranged in at most five demo groups, source-marked Template A/B sample blocks, three reader lenses worth of public Articles, full mock chapters for the three configured books, anonymized Field Notes, Dictionary terms and approved Q&A examples. Every narrative/source says DEMO ONLY; there are no verified technical claims, prices, legal standards, real identities or third-party images. **The thirty construction niche titles are just unapproved demo placeholders**, not CONSPACE's confirmed final taxonomy. Browser pages that collect private connection submissions are intentionally NOT pre-filled with fake private contacts, and Media Library rights metadata is never forged.

The script requires NODE_ENV=development, DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY, a local PostgreSQL connection named conspace and a 14+ character demo password. It refuses VPS/production, uses a single transaction, and does not overwrite existing authored book chapters, sections or editorial content. Re-running it fills missing sample records without duplicating them. Existing CMS admin credentials are never changed; the three demo editorial roles are created only if absent, or left intact. If the local database is already at taxonomy capacity, the remaining synthetic categories are skipped.

Check examples after restarting Backend/Frontend:

    http://127.0.0.1:5176/
    http://127.0.0.1:5176/ngach
    http://127.0.0.1:5176/mang/house
    http://127.0.0.1:5176/tu-sach
    http://127.0.0.1:5176/bai-viet
    http://127.0.0.1:5176/hien-truong
    http://127.0.0.1:5176/hoi-dap
    http://127.0.0.1:5176/tra-nhanh

This is a dataset for preview and testing only. It must never be treated as production editorial material, search engine content or evidence of compliance. No migration or VPS deployment.

## Local-only Field Notes and Q&A content (without full-site seed)

The independent command db:seed-demo-field-qa adds 16 [DEMO] fictional Field Notes and 24 [DEMO] reader questions with published sample answers across the existing eight verified architectural category slots (HOUSE, LUXURY, F&B, STAY, OFFICE, FACTORY, PROJECT, SACRED). It **does not create any other construction niches, books or articles outside these Field Notes**, and does not modify CMS content that already exists. It marks all records as simulations, never as real reported field cases, standards or professional advice. No real photos, site addresses, private contacts, prices or unsupported technical claims are inserted. Dummy approval metadata exists only to let the local public API render sample records; it does NOT represent actual editorial review.

Run from Windows CMD with local PostgreSQL started (DATABASE_URL must point to local conspace using conspace_app):

    cd /d D:\conspace
    docker start conspace-db-local
    npm.cmd run db:migrate --prefix backend
    npm.cmd run db:seed --prefix backend
    set "NODE_ENV=development"
    set "DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY"
    set /p DEMO_USER_PASSWORD=Nhap mat khau demo local (toi thieu 14 ky tu):
    npm.cmd run db:seed-demo-field-qa --prefix backend
    set DEMO_USER_PASSWORD=

Do not paste or screenshot the password. Run the command again safely if needed; it does not create duplicates, rotate existing credentials, delete prior demo posts, or overwrite editorial changes. The older db:seed-demo reset was narrowed to its own Q&A acceptance fixture and will no longer remove these reader examples on subsequent runs.

Check after Backend/Frontend restart:

    http://127.0.0.1:5176/hien-truong
    http://127.0.0.1:5176/hoi-dap
    http://127.0.0.1:5176/mang/house

CMS users can inspect the content only in local development. Never deploy the [DEMO] fixtures or use them as genuine published content. No new migration and no VPS changes.


## Test the Field Notes and Q&A discovery flow

After running `db:seed-demo-field-qa`, start local Backend and Frontend and open:

- `http://127.0.0.1:5176/hien-truong?niche=house` — Field Notes filtered by HOUSE
- `http://127.0.0.1:5176/hien-truong?q=gi%C6%B0%E1%BB%9Dng&niche=house` — a single bedroom-related fictional case
- `http://127.0.0.1:5176/hoi-dap?niche=house` — published HOUSE answers
- `http://127.0.0.1:5176/hoi-dap?q=gi%C6%B0%E1%BB%9Dng&niche=house` — one matching fictional Q&A, whose detail page links to its related published Field Note

Use the clear-filter action to return to all content; scroll down to `Xem thêm câu hỏi` to check page 2. No new migration and no extra seed needed after the code update. This is a UI test using synthetic, labeled data only, not guidance for a real project.
