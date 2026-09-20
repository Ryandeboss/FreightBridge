# FreightBridge

FreightBridge is a portfolio integration lab for modeling logistics EDI and API workflows between two fictitious trading partners and a middleware layer. The current contract milestone defines the synthetic partner models and integration contracts that future code will implement; EDI parsing, mappings, SFTP workflows, partner simulator behavior, and business workflows are intentionally deferred.

## Planned Architecture

FreightBridge connects an analyst-facing React UI, a FastAPI integration API, and Supabase PostgreSQL. Railway/SFTPGo is provisioned and reserved for a later SFTP milestone, but it is not part of the active application path yet.

Current verified cloud path:

```text
Browser
  -> Vercel Analyst UI
  -> HTTPS
  -> Render FreightBridge API
  -> PostgreSQL
  -> Supabase
```

Milestone 3 defines two independent partner sides:

- Apex Logistics: synthetic freight broker / 3PL using HTTPS REST and JSON.
- Midwest Carrier: synthetic motor carrier using X12 004010 over future SFTP.
- FreightBridge: future middleware between the two partner representations.

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
  partners/               Synthetic partner contracts and profiles
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

The backend liveness endpoint is available at `GET /health`. The dependency readiness endpoint is available at `GET /readiness` and verifies application configuration plus Supabase PostgreSQL connectivity with `SELECT 1`.

## Environment Variables

Copy each `.env.example` file to a local `.env` file when developing locally. Real values must be configured in hosting platforms and must not be committed.

Frontend:

- `VITE_API_BASE_URL`
- `VITE_APP_ENV`

Backend preferred:

- `APP_ENV`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`

Backend legacy names temporarily accepted:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Create `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Render when convenient. After Render has the new names and the API has redeployed successfully, the legacy names can be removed.

Railway/SFTP placeholders:

- `SFTP_PUBLIC_HOST`
- `SFTP_PUBLIC_PORT`
- `SFTP_USERNAME`
- `SFTP_SSH_PRIVATE_KEY_PATH`
- `SFTP_SSH_PUBLIC_KEY`

## Secret Boundaries

Supabase secret keys, database URLs, private SSH keys, passwords, and Render/Railway/Vercel tokens belong only in secure platform secret stores. Browser-exposed frontend variables must use the `VITE_` prefix and should only contain values that are safe to expose publicly, such as a backend API URL and app environment label.

Do not expose Supabase keys or database connection strings to Vercel frontend code.

## Contract Documentation

Major Milestone 3 contract files:

- [Apex partner profile](docs/partners/apex/partner-profile.md)
- [Apex data dictionary](docs/partners/apex/data-dictionary.md)
- [Apex OpenAPI contract](docs/partners/apex/openapi.yaml)
- [Apex outbound load tender contract](docs/partners/apex/outbound-load-tender-contract.md)
- [Apex service catalog](docs/partners/apex/service-catalog.md)
- [Midwest partner profile](docs/partners/midwest/partner-profile.md)
- [Midwest data dictionary](docs/partners/midwest/data-dictionary.md)
- [Midwest EDI implementation guide](docs/partners/midwest/edi-implementation-guide.md)
- [Midwest connectivity specification](docs/partners/midwest/connectivity-specification.md)
- [Midwest service catalog](docs/partners/midwest/service-catalog.md)
- [Trading partner matrix](docs/partners/trading-partner-matrix.md)
- [Error contract](docs/partners/error-contract.md)
- [Interface control document](docs/architecture/interface-control-document.md)
- [Contract decisions](docs/architecture/contract-decisions.md)

Sample contract fixtures:

- Apex JSON examples: `sample-data/json/apex/`
- Midwest X12 examples: `sample-data/x12/midwest/`

## Planned Deployment Targets

- Vercel: `apps/analyst-ui`
- Render: `services/freightbridge-api`
- Supabase: PostgreSQL and later Storage
- Railway: SFTPGo provisioned / reserved for later SFTP milestone

## Current Milestone

Implemented:

- Cloud foundation and deployment structure.
- API liveness and database readiness checks.
- Frontend status panel for API and Supabase readiness.

Specified:

- Apex Logistics REST/JSON contract.
- Midwest Carrier X12/SFTP contract.
- Partner comparison, interface control, error categories, and synthetic fixtures.

Planned:

- FreightBridge canonical model.
- Mapping rules.
- EDI parser/serializer.
- SFTP exchange.
- Apex and Midwest simulators.
- Shipment persistence and analyst workflow features.

Do not begin FreightBridge product features from this milestone.
