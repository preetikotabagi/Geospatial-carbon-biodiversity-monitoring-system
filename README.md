# Darukaa.Earth — Geospatial Carbon & Biodiversity Monitoring Dashboard

A full-stack MVP dashboard that lets an admin create restoration/monitoring
**projects**, add geographic **sites** to them by drawing polygons on a map,
and view **carbon and biodiversity analytics** for each site over time.

Built for the Darukaa.Earth hackathon.

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Features](#features)
4. [User Stories](#user-stories)
5. [Technology Stack](#technology-stack)
6. [Architecture](#architecture)
7. [Database Schema](#database-schema)
8. [API Overview](#api-overview)
9. [Authentication Flow](#authentication-flow)
10. [Geospatial Workflow](#geospatial-workflow)
11. [Analytics Workflow](#analytics-workflow)
12. [Mock / Demo Dataset](#mock--demo-dataset)
13. [Project Structure](#project-structure)
14. [Local Setup](#local-setup)
15. [PostgreSQL + PostGIS Setup](#postgresql--postgis-setup)
16. [Environment Variables](#environment-variables)
17. [Running the Application](#running-the-application)
18. [Testing](#testing)
19. [Code Quality Tooling](#code-quality-tooling)
20. [Pre-commit Hooks](#pre-commit-hooks)
21. [CI/CD (GitHub Actions)](#cicd-github-actions)
22. [Deployment](#deployment)
23. [Known Limitations & Trade-offs](#known-limitations--trade-offs)
24. [Future Improvements](#future-improvements)

---

## Overview

Darukaa.Earth needs a way for an admin to track the carbon and biodiversity
performance of restoration sites spread across multiple projects. This
dashboard provides: project management, polygon-based site mapping, and
time-series analytics, all behind JWT-protected accounts so each user only
ever sees their own data.

## Problem Statement

Environmental restoration organizations manage many physical sites across
several projects. Without a central tool, it's hard to answer simple
questions like "how much area are we currently monitoring?", "what's our
total estimated carbon sequestration?", or "how is biodiversity trending on
this specific site?". This dashboard centralizes that into one map-driven
interface.

## Features

- Email/password registration and login (JWT-based sessions)
- Create, list, and delete monitoring **projects**
- Draw polygon **sites** on an interactive Mapbox map and attach them to a
  project
- Project selector that filters the map, the site list, and the summary
  cards together, with no stale state
- Per-site analytics: area (via PostGIS), current carbon/biodiversity, and
  full historical trend charts
- "Add a yearly metric" form directly in the analytics panel, so carbon and
  biodiversity history can be entered from the UI (calls
  `POST /sites/{id}/metrics`) instead of only being reachable via the API
- Selected site is visually highlighted on the map (distinct fill/outline
  layer), separate from the default site styling
- Dashboard summary cards (projects, sites, total area, total carbon,
  average biodiversity) that recompute correctly for "all projects", a
  single project, or an empty project
- Ownership enforced everywhere: users can only see/edit/delete their own
  projects and the sites under them

## User Stories

1. Admin can create a new project. ✅
2. Admin can add multiple geographical sites to a project. ✅
3. Admin can view all projects and sites on an interactive map. ✅
4. Admin can select/filter projects. ✅
5. Admin can click a site on the map. ✅
6. Admin can view detailed analytics for the selected site. ✅
7. Analytics show performance over time (line charts by year), populated
   via the in-panel "add yearly metric" form. ✅

## Technology Stack

**Frontend**
- React 19 + Vite
- React Router
- Mapbox GL JS + `@mapbox/mapbox-gl-draw`
- Chart.js / `react-chartjs-2`
- Axios

**Backend**
- Python 3.12 + FastAPI
- SQLAlchemy 2.x + GeoAlchemy2
- Shapely
- JWT (`PyJWT`) + `bcrypt`

**Database**
- PostgreSQL + PostGIS

**Tooling**
- ESLint, Prettier, Husky, lint-staged (frontend)
- Ruff, Pytest (backend)
- GitHub Actions CI

**Deployment targets**
- Frontend → Vercel
- Backend → Render
- Database → any Render-compatible PostgreSQL instance with PostGIS enabled

## Architecture

```mermaid
flowchart LR
    subgraph Client
        A[React + Vite SPA]
    end
    subgraph API["FastAPI backend"]
        B[Auth router]
        C[Projects router]
        D[Sites router]
    end
    E[(PostgreSQL + PostGIS)]

    A -- "REST + JWT (Axios)" --> B
    A -- "REST + JWT" --> C
    A -- "REST + JWT" --> D
    B --> E
    C --> E
    D --> E
```

High level:

```
React frontend
      |
      | REST API + JWT (Bearer token)
      v
FastAPI backend  (auth / projects / sites routers)
      |
      | SQLAlchemy + GeoAlchemy2
      v
PostgreSQL + PostGIS
```

**Frontend state design.** The dashboard holds `projects`, `sites`, and a
per-site `analyticsById` map as the single source of truth in
`Dashboard.jsx`. The Mapbox component (`MapView.jsx`) is a purely
prop-driven display: it renders whatever `sites` array it's given and never
fetches or filters on its own. Selecting a project just changes which sites
are passed down — there's exactly one filtering code path, which is what
fixes the map/summary-card desync that existed in earlier versions of this
project.

## Database Schema

```
users
-----
id              PK
email           unique, not null
password_hash   not null
created_at

projects
--------
id              PK
name            not null
description
created_by      FK -> users.id
created_at

sites
-----
id              PK
project_id      FK -> projects.id  (cascade delete)
name            not null
description
geometry        POLYGON, SRID 4326 (PostGIS)
created_at

site_metrics
------------
id                    PK
site_id               FK -> sites.id  (cascade delete)
year                  not null
carbon_tco2e          not null
biodiversity_score    not null
```

Relationships: `User 1—N Project 1—N Site 1—N SiteMetric`. Deleting a
project cascades to its sites and their metrics (enforced at the ORM level
via `cascade="all, delete-orphan"`).

## API Overview

All endpoints except `/auth/register` and `/auth/login` require an
`Authorization: Bearer <token>` header.

| Method | Path                        | Description                                   |
|--------|-----------------------------|------------------------------------------------|
| POST   | `/auth/register`            | Create an account                              |
| POST   | `/auth/login`                | Log in, returns a JWT                          |
| GET    | `/projects/`                 | List the current user's projects               |
| POST   | `/projects/`                 | Create a project                               |
| GET    | `/projects/{id}`             | Get one project (must be owned by caller)      |
| DELETE | `/projects/{id}`             | Delete a project (cascades to sites/metrics)   |
| GET    | `/sites/`                     | List sites for the current user's projects (optional `?project_id=`) |
| POST   | `/sites/`                     | Create a site under an owned project           |
| GET    | `/sites/{id}`                 | Get one site (must be owned by caller)         |
| GET    | `/sites/{id}/analytics`       | Area + current + historical metrics for a site |
| POST   | `/sites/{id}/metrics`         | Add a yearly metric entry for a site           |
| GET    | `/health`                     | Liveness check                                 |

Interactive OpenAPI docs are available at `/docs` when the backend is
running.

## Authentication Flow

1. `POST /auth/register` hashes the password with `bcrypt` and stores the
   user.
2. `POST /auth/login` verifies the password and returns a JWT (`HS256`,
   signed with `SECRET_KEY`, expires after `ACCESS_TOKEN_EXPIRE_MINUTES`).
3. The frontend stores the token in `localStorage` (acceptable for this
   MVP; see [Known Limitations](#known-limitations--trade-offs)) and
   attaches it to every request via an Axios interceptor.
4. Every protected endpoint resolves `get_current_user` from the token; an
   invalid or expired token returns `401`, and the frontend clears its
   token and redirects to `/login` when that happens.
5. All project/site endpoints additionally check `created_by` (or the
   project's `created_by` for sites) so users can never read or modify
   another user's data — verified by the ownership tests in
   `backend/tests/`.

## Geospatial Workflow

1. Admin selects a project in the "Add Site" panel.
2. Admin draws a polygon on the map using Mapbox Draw.
3. The drawn GeoJSON geometry is lifted into `Dashboard.jsx` state via a
   callback from `MapView`.
4. On save, the frontend POSTs `{ project_id, name, description, geometry }`
   to `/sites/`.
5. The backend converts the GeoJSON into a Shapely polygon, validates that
   it actually is a `Polygon` and is topologically valid, then stores it as
   a PostGIS `POLYGON(SRID 4326)` via GeoAlchemy2's `from_shape`.
6. Reading sites back uses `ST_AsGeoJSON` so the frontend always works with
   plain GeoJSON.

## Analytics Workflow

- **Area**: computed server-side with
  `ST_Area(ST_Transform(geometry, 6933))` — the geometry is reprojected
  from WGS84 (degrees) into an equal-area projection (EPSG:6933) before
  measuring, then converted from m² to hectares. Doing this in PostGIS
  keeps the calculation accurate regardless of where on Earth a site is.
- **Current metrics**: the most recent (`year`) entry in `site_metrics`.
- **History**: all `site_metrics` rows for the site, ordered by year, used
  to draw the two Chart.js line charts (carbon and biodiversity) with year
  on the X-axis.
- A site with no metrics yet returns `current: { carbon_tco2e: 0,
  biodiversity_score: 0 }` and an empty `history` array — the frontend
  shows a friendly empty state (with a call-to-action to add the first
  metric) instead of an error or a blank panel.
- New metrics are added from the analytics panel's "+ Add a yearly
  metric" form; the frontend merges the response into local state so the
  current-value cards and both charts update immediately, with no page
  reload or re-fetch.

## Mock / Demo Dataset

**Carbon and biodiversity figures in this MVP are demo/mock data**, entered
one year at a time through the "+ Add a yearly metric" form in the
analytics panel (which calls `POST /sites/{id}/metrics` under the hood).
There is no integration with real remote-sensing or field-survey
pipelines — building that is out of scope for a hackathon MVP. Only
**area** is a real, computed value (via PostGIS on the actual drawn
polygon); carbon and biodiversity numbers are illustrative placeholders
meant to demonstrate the analytics UI and should not be treated as
real-world measurements. The analytics panel itself labels each chart
"Demo data" and explains this directly in the UI, not just here.

## Project Structure

```
darukaa-earth/
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios instance + endpoint helpers
│   │   ├── components/     # MapView, ProjectPanel, SiteForm, SummaryCards, AnalyticsPanel, ProtectedRoute
│   │   ├── context/         # AuthContext
│   │   ├── pages/            # Login, Register, Dashboard
│   │   ├── App.jsx / main.jsx
│   │   └── App.css / index.css
│   ├── .env.example
│   ├── package.json
│   └── eslint.config.js
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, router registration
│   │   ├── config.py         # env-var driven configuration
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # User, Project, Site, SiteMetric
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── auth.py           # register/login/JWT
│   │   ├── projects.py       # project CRUD
│   │   └── sites.py          # site CRUD + analytics
│   ├── tests/                 # pytest suite
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── .env.example
├── .github/workflows/         # CI pipelines
└── README.md
```

## Local Setup

Prerequisites: **Python 3.11+**, **Node.js 20+**, **PostgreSQL 14+ with
PostGIS**, and a free [Mapbox](https://account.mapbox.com/access-tokens/)
access token.

```bash
git clone <this-repo>
cd darukaa-earth
```

## PostgreSQL + PostGIS Setup

1. Create the database:
   ```sql
   CREATE DATABASE darukaa_earth;
   ```
2. Enable PostGIS on it:
   ```sql
   \c darukaa_earth
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Note the connection string, e.g.
   `postgresql://postgres:postgres@localhost:5432/darukaa_earth`.

(On Render, use a managed Postgres instance and run the same
`CREATE EXTENSION` statement once via `psql` or Render's SQL console —
Render's Postgres offering supports PostGIS.)

## Environment Variables

**Backend** (`backend/.env`, see `backend/.env.example`):

| Variable                      | Description                                             |
|--------------------------------|----------------------------------------------------------|
| `DATABASE_URL`                 | PostgreSQL connection string (PostGIS-enabled database)  |
| `SECRET_KEY`                   | Random secret used to sign JWTs                          |
| `ALGORITHM`                    | JWT algorithm (default `HS256`)                          |
| `ACCESS_TOKEN_EXPIRE_MINUTES`  | Token lifetime in minutes (default `60`)                 |
| `CORS_ORIGINS`                 | Comma-separated list of allowed frontend origins          |

**Frontend** (`frontend/.env`, see `frontend/.env.example`):

| Variable             | Description                              |
|----------------------|--------------------------------------------|
| `VITE_API_URL`       | Base URL of the backend API                |
| `VITE_MAPBOX_TOKEN`  | Your Mapbox access token                    |

No real secrets are committed anywhere in this repository — only
`.env.example` files with placeholder values.

## Running the Application

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit DATABASE_URL / SECRET_KEY
uvicorn app.main:app --reload
```

The API starts on `http://127.0.0.1:8000` (docs at `/docs`). Tables are
created automatically on startup via `Base.metadata.create_all` — no
manual migration step is required for this MVP (see
[Known Limitations](#known-limitations--trade-offs) regarding Alembic).

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env             # then edit VITE_MAPBOX_TOKEN
npm run dev
```

The app starts on `http://localhost:5173`. Register an account, log in,
create a project, draw a site on the map, and save it.

## Testing

**Backend** — 22 pytest tests covering registration/login, JWT
validation, project CRUD, cross-user ownership checks, cascade deletes,
site creation/validation, and analytics (including the "no metrics yet"
and "latest year" cases):

```bash
cd backend
pip install -r requirements-dev.txt
createdb darukaa_earth_test        # or use an existing PostGIS-enabled DB
psql darukaa_earth_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/darukaa_earth_test \
SECRET_KEY=test-secret \
pytest -v
```

All 22 tests were run and verified passing against a real local
PostgreSQL + PostGIS instance while building this project (not just
imported/compiled — actually executed end-to-end, including live HTTP
requests exercising the running FastAPI app with `TestClient`).

**Frontend** — no automated test suite is included (out of scope for
this MVP); `npm run lint`, `npm run format:check`, and `npm run build`
were all run and verified passing.

## Code Quality Tooling

**Backend**: [Ruff](https://docs.astral.sh/ruff/) for linting.

```bash
cd backend
ruff check app tests
```

**Frontend**: ESLint + Prettier.

```bash
cd frontend
npm run lint           # ESLint
npm run format         # Prettier --write
npm run format:check   # Prettier --check
npm run build           # production build
```

## Pre-commit Hooks

The frontend uses **Husky** + **lint-staged** to run ESLint (`--fix`) and
Prettier on staged files before every commit.

Setup (one-time, after cloning):

```bash
git init                 # if this isn't already a git repo
cd frontend
npm install               # runs `husky` via the `prepare` script
git config core.hooksPath frontend/.husky   # only needed because backend+frontend share one repo root
```

This was verified working locally: staging a file with a lint violation
and running `git commit` triggers `lint-staged`, which fixes/reformats the
file and blocks the commit if an error can't be auto-fixed.

## CI/CD (GitHub Actions)

Two workflows live in `.github/workflows/`:

- **`backend.yml`** — spins up a `postgis/postgis:16-3.4` service
  container, enables the PostGIS extension, installs
  `requirements-dev.txt`, runs `ruff check`, then runs the full `pytest`
  suite.
- **`frontend.yml`** — installs dependencies with `npm ci`, runs
  `npm run lint`, `npm run format:check`, and `npm run build`.

Both trigger on push/PR to `main`, scoped by path filters so a
frontend-only change doesn't re-run the backend job and vice versa.
Neither workflow performs a real deployment — see below for that.

## Deployment

This project is **deployment-ready but has not been deployed** as part of
this submission (no Render/Vercel accounts or Mapbox production token were
available in this environment). Steps to deploy:

**Database (Render PostgreSQL)**
1. Create a Render PostgreSQL instance.
2. Connect via `psql` and run `CREATE EXTENSION IF NOT EXISTS postgis;`
   (confirm your Render plan supports PostGIS — most standard Postgres
   instances do).
3. Copy the connection string for use as `DATABASE_URL`.

**Backend (Render Web Service)**
1. Create a new Web Service pointing at the `backend/` directory.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set environment variables in Render's dashboard:
   `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
   `CORS_ORIGINS` (set this to your Vercel frontend URL once you have it).

**Frontend (Vercel)**
1. Import the repo, set the project root to `frontend/`.
2. Framework preset: Vite.
3. Set environment variables in Vercel's dashboard:
   `VITE_API_URL` (your Render backend URL) and `VITE_MAPBOX_TOKEN`.
4. Deploy. Once you have the Vercel URL, update the backend's
   `CORS_ORIGINS` on Render to include it, and redeploy the backend.

**GitHub secrets**: none are required for the CI workflows above (they
use disposable/placeholder values). If you later add a CD workflow that
deploys automatically, you would add `RENDER_API_KEY` /
`VERCEL_TOKEN`-style secrets in the repo's Settings → Secrets and
Variables → Actions — this repo does not currently do this, to avoid
faking a deployment step with no real credentials behind it.

## Known Limitations & Trade-offs

- **Mock analytics data**: see [Mock / Demo Dataset](#mock--demo-dataset).
- **JWT in `localStorage`**: simpler than httpOnly cookies for an MVP, but
  technically more exposed to XSS. Acceptable trade-off for a hackathon
  demo; a production version should move to httpOnly cookies + refresh
  tokens.
- **No Alembic migrations**: schema is created via
  `Base.metadata.create_all`. This is fine for a fresh MVP database but
  won't handle future schema changes gracefully — see below.
- **No site edit/delete endpoints**: sites can be created and viewed, and
  are removed via cascading project deletion, but there's no direct
  "delete a single site" or "edit a site" endpoint yet.
- **Analytics are pre-fetched per site on dashboard load**: fine at MVP
  scale (dozens of sites); would need pagination/batching for hundreds+.
- **No automated frontend test suite.**

## Future Improvements

- Add Alembic for versioned database migrations.
- Add `PATCH`/`DELETE` endpoints for individual sites and for editing site
  metadata/geometry.
- Move JWTs to httpOnly cookies with refresh-token rotation.
- Add role-based access (e.g. shared/team projects, not just per-user).
- Replace mock metrics with a real ingestion pipeline (satellite imagery
  or field survey uploads).
- Add frontend component/integration tests (e.g. Vitest + React Testing
  Library).
- Add a CD workflow that actually deploys to Render/Vercel on merge to
  `main`, once real hosting credentials exist.
