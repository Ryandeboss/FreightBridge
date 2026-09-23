# FreightBridge

FreightBridge is a portfolio integration lab for modeling logistics EDI and API workflows between two fictitious trading partners and a middleware layer. The current state includes the FreightBridge foundation, independent Apex and Midwest simulators, Apex-to-FreightBridge canonical shipment ingestion, a generic X12 structural foundation, Midwest 204 generation/direct delivery, Midwest 997 functional acknowledgment processing, Midwest 990 tender-response return processing, Midwest 214 shipment-status processing, operations transaction/error observability APIs, and a real Railway/SFTPGo SFTP exchange path for Midwest files.

## Planned Architecture

FreightBridge connects an analyst-facing React UI, a FastAPI integration API, Supabase PostgreSQL, partner simulators, and a Railway/SFTPGo server for Midwest-style file exchange.

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
- Midwest Carrier: synthetic motor carrier using X12 004010 over Railway/SFTPGo SFTP, with a temporary REST test harness retained for regression testing.
- FreightBridge: implemented canonical foundation with Apex load tender ingestion, Midwest 204 outbound generation, and Midwest 990 inbound tender-response processing.

```text
Apex Simulator
  [implemented]
      |
      | HTTPS REST/JSON + bearer
      v
FreightBridge
  [implemented canonical ingestion + 204 outbound + 997/990/214 return flow]
      |
      | SFTP /inbound carrying X12 204
      v
Midwest
  [implemented simulator]
      |
      | SFTP /outbound carrying X12 997, 990, and 214
      v
FreightBridge
  [stores technical acks; forwards business tender/status updates to Apex]
```

Operations support can inspect the same transaction/log/error records through secured `/api/operations` endpoints. See [Operational observability and failure queue](docs/operations/observability-and-failure-queue.md) and [Idempotency, replay, and manual retry](docs/operations/idempotency-and-retry.md).

See [docs/architecture/initial-architecture.md](docs/architecture/initial-architecture.md) for the first architecture diagram.

## Technology Stack

- Frontend: React, TypeScript, Vite, ESLint, deployed to Vercel.
- Backend: Python, FastAPI, pytest, deployed to Render.
- Database: Supabase PostgreSQL.
- Storage: Supabase Storage later for raw EDI payloads and documents if needed.
- SFTP: Railway-hosted SFTPGo with public TCP proxying.
- Source control and CI: GitHub and GitHub Actions.

## Repository Structure

```text
apps/
  analyst-ui/             React + TypeScript analyst dashboard placeholder
services/
  freightbridge-api/      FastAPI integration API foundation
  apex-partner-sim/       FastAPI Apex REST/JSON partner simulator
  midwest-partner-sim/    FastAPI Midwest X12 partner simulator
docs/
  architecture/           System architecture notes
  partners/               Synthetic partner contracts and profiles
  mappings/               Future canonical/X12 mapping notes
  testing/                Testing strategy notes
  operations/             Deployment and runbook notes
infrastructure/
  railway/                SFTPGo/Railway setup and runbook
  docker/                 Future container support
  supabase/migrations/    Empty database migration area
sample-data/
  x12/                    Synthetic X12 payloads
  json/                   Future synthetic JSON payloads
scripts/                  Developer and deployed acceptance automation
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

Midwest simulator:

```bash
cd services/midwest-partner-sim
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload
```

The FreightBridge and Apex backends both expose `GET /health` and `GET /readiness`. Apex business endpoints require bearer-token authentication.

Deployed Milestone 12 acceptance can be run without Postman once deployment environment variables are available:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python scripts/acceptance/milestone12.py
```

Milestone 14 acceptance verifies the operations failure queue with a real duplicate-shipment failure:

```bash
python scripts/acceptance/milestone14.py
```

See [deployed acceptance harness](docs/testing/deployed-acceptance-harness.md) for required environment variables, GitHub Actions secrets, optional DB verification, and failure reporting. Postman collections remain available for individual route debugging.

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
- `OPERATIONS_API_BEARER_TOKEN`
- `MIDWEST_INBOUND_BEARER_TOKEN`
- `APEX_SIM_BASE_URL`
- `APEX_SIM_BEARER_TOKEN`
- `MWCX_SFTP_HOST`
- `MWCX_SFTP_PORT`
- `MWCX_SFTP_USERNAME`
- `MWCX_SFTP_PRIVATE_KEY_B64`
- `MWCX_SFTP_HOST_KEY_SHA256`

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

Midwest simulator:

- `APP_ENV`
- `DATABASE_URL`
- `MIDWEST_API_BEARER_TOKEN`
- `MIDWEST_API_READONLY_TOKEN`
- `FREIGHTBRIDGE_API_BASE_URL`
- `FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN`
- `MWCX_SFTP_HOST`
- `MWCX_SFTP_PORT`
- `MWCX_SFTP_USERNAME`
- `MWCX_SFTP_PRIVATE_KEY_B64`
- `MWCX_SFTP_HOST_KEY_SHA256`

FreightBridge Midwest direct test harness:

- `MIDWEST_SIM_BASE_URL`
- `MIDWEST_SIM_BEARER_TOKEN`

Railway/SFTPGo service:

- Container image: `ghcr.io/drakkan/sftpgo:2.7.x`
- Internal SFTP port: `2022`
- Web Admin port: `8080`
- Persistent volume: `/var/lib/sftpgo`
- Runbook: [SFTPGo Railway runbook](docs/operations/sftpgo-railway-runbook.md)

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
- [Milestone 9 Midwest simulator acceptance](docs/testing/milestone-9-midwest-simulator.md)
- [Milestone 10 Midwest 990 return flow acceptance](docs/testing/milestone-10-midwest-990-return-flow.md)
- [Milestone 11 Midwest SFTP transport acceptance](docs/testing/milestone-11-sftp-transport.md)
- [Milestone 12 Midwest 214 status flow acceptance](docs/testing/milestone-12-midwest-214-status-flow.md)
- [Milestone 13 997 functional acknowledgment acceptance](docs/testing/milestone-13-997-functional-acknowledgment.md)
- [Deployed acceptance harness](docs/testing/deployed-acceptance-harness.md)
- [Midwest 214 to canonical event mapping](docs/mappings/midwest-214-to-canonical-event.md)
- [Midwest 997 functional acknowledgment mapping](docs/mappings/midwest-997-functional-acknowledgment.md)

Sample contract fixtures:

- Apex JSON examples: `sample-data/json/apex/`
- Midwest X12 examples: `sample-data/x12/midwest/`

## Planned Deployment Targets

- Vercel: `apps/analyst-ui`
- Render: `services/freightbridge-api`
- Render: `services/apex-partner-sim`
- Supabase: PostgreSQL and later Storage
- Railway: SFTPGo for Midwest SFTP exchange

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
- Independent Midwest Carrier simulator with temporary direct REST/X12 delivery harness.
- Midwest tender decision endpoint, independent X12 990 generation, FreightBridge inbound 990 processing, and Apex tender-status readback.
- Railway/SFTPGo-backed Midwest 204 and 990 file exchange with manual poll endpoints, archive/error routing, host-key verification, and atomic upload protection.
- Midwest X12 214 shipment-status event creation, SFTP dispatch, FreightBridge canonical event history/current-status handling, and Apex shipment-status readback.
- Midwest X12 997 functional acknowledgment generation, SFTP dispatch, FreightBridge AK1/AK2 correlation to outbound 204, and technical acknowledgment audit.
- Reusable deployed acceptance harness for Milestone 12 black-box testing against Apex, FreightBridge, Midwest, and SFTPGo through public HTTP endpoints.

Specified:

- Apex Logistics REST/JSON contract.
- Midwest Carrier X12/SFTP contract.
- Midwest 204 mapping requirements.
- Partner comparison, interface control, error categories, and synthetic fixtures.

Planned:

- Generic/configurable mapping engine.
- 997 processing.
- Shipment persistence and analyst workflow features.

Do not begin FreightBridge product features from this milestone.
