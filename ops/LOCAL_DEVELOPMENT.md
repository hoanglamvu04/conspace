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

## Test before asking for deployment

    npm.cmd run check --prefix backend
    npm.cmd test --prefix backend
    npm.cmd test --prefix frontend
    npm.cmd run build

Only after local tests and GitHub Actions pass should the owner review a separate production release checklist. Push to main is not permission to deploy. VPS, Nginx, PM2, SSL and other applications remain untouched during local development.
