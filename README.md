# FreightBridge

FreightBridge is a portfolio integration lab for modeling logistics EDI and API workflows between two fictitious trading partners and a middleware layer. This milestone establishes the project foundation only; EDI parsing, mappings, SFTP, partner simulator behavior, and business workflows are intentionally deferred.

## Planned Architecture

FreightBridge will connect an analyst-facing React UI, a FastAPI integration API, Supabase PostgreSQL, and later SFTPGo on Railway for public SFTP intake. The lab will eventually model:

- Apex Partner Simulator sending REST/JSON shipment events.
- FreightBridge API normalizing data into a canonical model.
- Midwest Carrier Simulator receiving future X12/SFTP-style exchanges.
- Analyst UI observing pipeline status and operational data.

See [docs/architecture/initial-architecture.md](docs/architecture/initial-architecture.md) for the first architecture diagram.

## Technology Stack

- Frontend: React, TypeScript, Vite, ESLint, deployed to Vercel.
- Backend: Python, FastAPI, pytest, deployed to Render.
- Database: Supabase PostgreSQL.
- Storage: Supabase Storage later for raw EDI payloads and documents if needed.
- SFTP: Railway-hosted SFTPGo later, with public TCP proxying.
- Source control and CI: GitHub and GitHub Actions.

## Repository Structure

```text
apps/
  analyst-ui/             React + TypeScript analyst dashboard placeholder
services/
  freightbridge-api/      FastAPI integration API foundation
  apex-partner-sim/       Placeholder for future Apex simulator
  midwest-partner-sim/    Placeholder for future Midwest simulator
docs/
  architecture/           System architecture notes
  partners/               Future partner contracts and profiles
  mappings/               Future canonical/X12 mapping notes
  testing/                Testing strategy notes
  operations/             Deployment and runbook notes
infrastructure/
  railway/                Future SFTPGo/Railway planning
  docker/                 Future container support
  supabase/migrations/    Empty database migration area
sample-data/
  x12/                    Future synthetic X12 payloads
  json/                   Future synthetic JSON payloads
scripts/                  Future developer automation
```

## Local Development

Frontend:

```bash
cd apps/analyst-ui
npm install
npm run lint
npm run build
npm run dev
```

Backend:

```bash
cd services/freightbridge-api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload
```

The backend health endpoint is available at `GET /health`.

## Environment Variables

Copy each `.env.example` file to a local `.env` file when developing locally. Real values must be configured in hosting platforms and must not be committed.

Frontend:

- `VITE_API_BASE_URL`
- `VITE_APP_ENV`

Backend:

- `APP_ENV`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

Railway/SFTP placeholders:

- `SFTP_PUBLIC_HOST`
- `SFTP_PUBLIC_PORT`
- `SFTP_USERNAME`
- `SFTP_SSH_PRIVATE_KEY_PATH`
- `SFTP_SSH_PUBLIC_KEY`

## Secret Boundaries

Supabase service-role keys, database URLs, private SSH keys, passwords, and Render/Railway/Vercel tokens belong only in secure platform secret stores. Browser-exposed frontend variables must use the `VITE_` prefix and should only contain values that are safe to expose publicly, such as a backend API URL.

## Planned Deployment Targets

- Vercel: `apps/analyst-ui`
- Render: `services/freightbridge-api`
- Supabase: PostgreSQL and later Storage
- Railway: future SFTPGo service with public TCP proxying

## Current Milestone

This repository currently contains only the clean project and deployment foundation. Do not begin FreightBridge product features from this milestone.
