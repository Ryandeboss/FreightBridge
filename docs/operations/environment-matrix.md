# Environment Matrix

FreightBridge is deployed as a synthetic portfolio lab. These environments demonstrate the integration surface without real trading partners, customer freight, or production TMS obligations.

## Components

| Component | Host | Runtime | Purpose | Public Surface |
| --- | --- | --- | --- | --- |
| Analyst UI | Vercel | React / TypeScript | Operations console and Integration Lab UI. | Browser app only. |
| FreightBridge API | Render | Python / FastAPI | Canonical integration, X12 mapping, SFTP polling, observability, configuration, and Lab APIs. | Partner and operations REST endpoints. |
| Apex Partner Simulator | Render | Python / FastAPI | Synthetic REST/JSON broker load-tender partner. | Apex simulator REST endpoints. |
| Midwest Partner Simulator | Render | Python / FastAPI | Synthetic X12 carrier simulator. | Midwest REST control/readback endpoints. |
| PostgreSQL | Supabase | PostgreSQL | Canonical domain data, audit records, partner configuration, Lab runs, and simulator persistence. | Server-side database only. |
| SFTPGo | Railway | SFTPGo | Temporary SFTP transport for Midwest X12 files. | SFTP service consumed by backend services. |

## Runtime Configuration

| Service | Required Runtime Inputs | Secret Boundary |
| --- | --- | --- |
| Analyst UI | `VITE_API_BASE_URL`, `VITE_APP_ENV` | Does not receive partner tokens, SFTP credentials, database URLs, or Supabase secrets. |
| FreightBridge API | app environment, allowed origins, Supabase metadata, database URL, partner base URLs, partner bearer tokens, operations token, Midwest SFTP settings | All partner tokens, database URLs, Supabase secrets, and SFTP private keys stay backend-only. |
| Apex Partner Simulator | app environment, database URL, Apex API tokens, FreightBridge callback URL/token | Simulator tokens and database URL stay service-side. |
| Midwest Partner Simulator | app environment, database URL, Midwest API tokens, FreightBridge callback URL/token, SFTP settings | Simulator tokens and SFTP settings stay service-side. |
| Acceptance Harness | deployed base URLs, simulator tokens, operations token, Analyst UI URL | GitHub Actions secrets/variables only; no new production variables are required for Milestone 22. |

## Readiness Gates

| Area | Endpoint Or Check | Expected MVP Signal |
| --- | --- | --- |
| Apex service | `GET /health`, `GET /readiness` | Service is live and simulator database/schema dependencies are ready. |
| FreightBridge service | `GET /health`, `GET /readiness` | Service is live; configuration, database, and domain schema are ready. |
| Midwest service | `GET /health`, `GET /readiness` | Service is live and simulator database/schema dependencies are ready. |
| FreightBridge SFTP | `GET /api/integrations/midwest/sftp/readiness` | Midwest SFTP transport reports `ready` and `SFTP`. |
| Midwest SFTP | `GET /v1/sftp/readiness` | Midwest SFTP transport reports `ready` and `SFTP`. |
| Operations | `GET /api/operations/summary` | Stable operations summary fields are readable with the operations token. |
| Configuration | partner and mapping APIs | APEX/MWCX partners, capabilities, and active mapping profiles are readable. |
| Integration Lab | `GET /api/lab/readiness` | Full lifecycle scenario and current failure drills are available. |
| Analyst UI | deployed app | Operations console unlocks and primary navigation is visible. |

## Current MVP Scope

Implemented X12 transactions are `204`, `997`, `990`, and `214` against a project-specific Midwest profile. Deferred Phase 2 items include `210`, AS2/MDN, SOAP/XML third partner behavior, `999`, `TA1`, and production-grade promotion/change-management workflows.
