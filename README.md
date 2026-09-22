# FreightBridge

FreightBridge is a portfolio integration lab for modeling logistics EDI and API workflows between two fictitious trading partners and a middleware layer. The current state includes the FreightBridge foundation, an independent Apex REST/JSON simulator, the first Apex-to-FreightBridge canonical shipment ingestion path, a generic X12 structural foundation, and Midwest 204 generation from canonical shipments; SFTP workflows, Midwest simulator behavior, 990/214/997 processing, and end-to-end carrier workflows remain intentionally deferred.

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

Current partner state:

- Apex Logistics: implemented synthetic freight broker / 3PL simulator using HTTPS REST and JSON, with explicit dispatch to FreightBridge.
- Midwest Carrier: synthetic motor carrier using X12 004010 over future SFTP.
- FreightBridge: implemented canonical foundation with Apex load tender ingestion, not yet connected to Midwest.

```text
Apex Simulator
  [implemented]
      |
      | HTTPS REST/JSON + bearer
      v
FreightBridge
  [implemented canonical ingestion + 204 generation preview]
      |
      | generated X12 204, future SFTP
      v
Midwest
  [contract + future simulator]
```

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
  apex-partner-sim/       FastAPI Apex REST/JSON partner simulator
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
  x12/                    Synthetic X12 payloads
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

Apex simulator:

```bash
cd services/apex-partner-sim
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload
```

The FreightBridge and Apex backends both expose `GET /health` and `GET /readiness`. Apex business endpoints require bearer-token authentication.

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
- `APEX_INBOUND_BEARER_TOKEN`

Backend legacy names temporarily accepted:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Create `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in Render when convenient. After Render has the new names and the API has redeployed successfully, the legacy names can be removed.

Apex simulator:

- `APP_ENV`
- `DATABASE_URL`
- `APEX_API_BEARER_TOKEN`
- `APEX_API_READONLY_TOKEN`
- `FREIGHTBRIDGE_API_BASE_URL`
- `FREIGHTBRIDGE_APEX_BEARER_TOKEN`

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
- [Canonical data model](docs/architecture/canonical-data-model.md)
- [Database schema](docs/architecture/database-schema.md)
- [Generic X12 foundation](docs/architecture/x12-foundation.md)
- [Midwest 204 generation architecture](docs/architecture/midwest-204-generation.md)
- [Milestone 4 database acceptance](docs/testing/milestone-4-database-acceptance.md)
- [Milestone 5 Apex acceptance](docs/testing/milestone-5-apex-acceptance.md)
- [Apex load tender mapping](docs/mappings/apex-load-tender-to-canonical.md)
- [Canonical shipment to Midwest 204 mapping](docs/mappings/canonical-to-midwest-204.md)
- [Milestone 6 Apex -> FreightBridge acceptance](docs/testing/milestone-6-apex-freightbridge-integration.md)
- [Milestone 7 Generic X12 foundation acceptance](docs/testing/milestone-7-x12-foundation.md)
- [Milestone 8 Midwest 204 generation acceptance](docs/testing/milestone-8-midwest-204-generation.md)

Sample contract fixtures:

- Apex JSON examples: `sample-data/json/apex/`
- Midwest X12 examples: `sample-data/x12/midwest/`

## Planned Deployment Targets

- Vercel: `apps/analyst-ui`
- Render: `services/freightbridge-api`
- Render: `services/apex-partner-sim`
- Supabase: PostgreSQL and later Storage
- Railway: SFTPGo provisioned / reserved for later SFTP milestone

## Current Milestone

Implemented:

- Cloud foundation and deployment structure.
- API liveness and database readiness checks.
- Frontend status panel for API and Supabase readiness.
- FreightBridge canonical domain models.
- PostgreSQL domain schema once `infrastructure/supabase/migrations/20260920_001_create_freightbridge_domain.sql` is applied.
- Apex Logistics REST/JSON simulator.
- Apex logical PostgreSQL schema once `infrastructure/supabase/migrations/20260920_002_create_apex_simulator.sql` is applied.
- Apex -> FreightBridge REST/JSON integration.
- Apex partner authentication for FreightBridge inbound loads.
- Apex -> canonical shipment mapping.
- Integration transaction, processing log, and integration error audit for Apex ingestion.
- Generic X12 parsing, envelope validation, and serialization foundation.
- Midwest-specific canonical shipment -> X12 204 generation preview endpoint.

Specified:

- Apex Logistics REST/JSON contract.
- Midwest Carrier X12/SFTP contract.
- Midwest 204 mapping requirements.
- Partner comparison, interface control, error categories, and synthetic fixtures.

Planned:

- Generic/configurable mapping engine.
- SFTP exchange.
- Midwest simulator.
- 990, 214, and 997 processing.
- Shipment persistence and analyst workflow features.

Do not begin FreightBridge product features from this milestone.
