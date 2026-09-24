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

No secret values belong in this document. The table records configuration names, ownership, and visibility only.

| Component | Variable | Required / Optional | Visibility | Purpose |
| --- | --- | --- | --- | --- |
| Analyst UI | `VITE_API_BASE_URL` | Required | Browser-visible | FreightBridge API base URL used by the Analyst Console. |
| Analyst UI | `VITE_APP_ENV` | Required | Browser-visible | Safe environment label displayed/used by the frontend. |
| FreightBridge API | `APP_ENV` | Required | Server-side | Runtime environment label. |
| FreightBridge API | `ALLOWED_ORIGINS` | Required | Server-side | Allowed frontend CORS origins. |
| FreightBridge API | `SUPABASE_URL` | Required | Server-side configuration | Supabase project URL. |
| FreightBridge API | `SUPABASE_PUBLISHABLE_KEY` | Required | Server-side | Supabase publishable key used by the backend configuration. |
| FreightBridge API | `SUPABASE_SECRET_KEY` | Required | Server-side secret | Backend-only Supabase credential. |
| FreightBridge API | `DATABASE_URL` | Required | Server-side secret | PostgreSQL connection string. |
| FreightBridge API | `APEX_INBOUND_BEARER_TOKEN` | Required | Server-side secret | Authenticates Apex-to-FreightBridge inbound integration requests. |
| FreightBridge API | `OPERATIONS_API_BEARER_TOKEN` | Required | Server-side secret | Protects operations, configuration, and Integration Lab APIs. |
| FreightBridge API | `MIDWEST_SIM_BASE_URL` | Required | Server-side configuration | Midwest simulator REST base URL. |
| FreightBridge API | `MIDWEST_SIM_BEARER_TOKEN` | Required | Server-side secret | Authenticates FreightBridge-to-Midwest simulator requests. |
| FreightBridge API | `MIDWEST_INBOUND_BEARER_TOKEN` | Required | Server-side secret | Authenticates Midwest-to-FreightBridge direct integration requests. |
| FreightBridge API | `APEX_SIM_BASE_URL` | Required | Server-side configuration | Apex simulator REST base URL. |
| FreightBridge API | `APEX_SIM_BEARER_TOKEN` | Required | Server-side secret | Authenticates FreightBridge-to-Apex simulator callbacks. |
| FreightBridge API | `MWCX_SFTP_HOST` | Required | Server-side configuration | Railway/SFTPGo TCP host. |
| FreightBridge API | `MWCX_SFTP_PORT` | Required | Server-side configuration | Railway/SFTPGo TCP port. |
| FreightBridge API | `MWCX_SFTP_USERNAME` | Required | Server-side configuration | Midwest SFTP account name. |
| FreightBridge API | `MWCX_SFTP_PRIVATE_KEY_B64` | Required | Server-side secret | Base64-encoded SFTP private key. |
| FreightBridge API | `MWCX_SFTP_HOST_KEY_SHA256` | Required | Server-side transport configuration | Pinned SFTP host-key fingerprint. |
| Apex Simulator | `APP_ENV` | Required | Server-side | Runtime environment label. |
| Apex Simulator | `DATABASE_URL` | Required | Server-side secret | PostgreSQL connection string. |
| Apex Simulator | `APEX_API_BEARER_TOKEN` | Required | Server-side secret | Apex simulator write/API bearer token. |
| Apex Simulator | `APEX_API_READONLY_TOKEN` | Optional | Server-side secret | Optional read-only Apex API token. |
| Apex Simulator | `FREIGHTBRIDGE_API_BASE_URL` | Required | Server-side configuration | FreightBridge API callback base URL. |
| Apex Simulator | `FREIGHTBRIDGE_APEX_BEARER_TOKEN` | Required | Server-side secret | Authenticates Apex dispatches into FreightBridge. |
| Midwest Simulator | `APP_ENV` | Required | Server-side | Runtime environment label. |
| Midwest Simulator | `DATABASE_URL` | Required | Server-side secret | PostgreSQL connection string. |
| Midwest Simulator | `MIDWEST_API_BEARER_TOKEN` | Required | Server-side secret | Midwest simulator write/API token. |
| Midwest Simulator | `MIDWEST_API_READONLY_TOKEN` | Optional | Server-side secret | Optional read-only Midwest API token. |
| Midwest Simulator | `FREIGHTBRIDGE_API_BASE_URL` | Required | Server-side configuration | FreightBridge API callback base URL. |
| Midwest Simulator | `FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN` | Required | Server-side secret | Authenticates Midwest-to-FreightBridge API calls. |
| Midwest Simulator | `MWCX_SFTP_HOST` | Required | Server-side configuration | Railway/SFTPGo TCP host. |
| Midwest Simulator | `MWCX_SFTP_PORT` | Required | Server-side configuration | Railway/SFTPGo TCP port. |
| Midwest Simulator | `MWCX_SFTP_USERNAME` | Required | Server-side configuration | Midwest SFTP account name. |
| Midwest Simulator | `MWCX_SFTP_PRIVATE_KEY_B64` | Required | Server-side secret | Base64-encoded SFTP private key. |
| Midwest Simulator | `MWCX_SFTP_HOST_KEY_SHA256` | Required | Server-side transport configuration | Pinned SFTP host-key fingerprint. |
| Acceptance Harness | `APEX_BASE_URL` | Required | GitHub Actions secret/configuration | Deployed Apex simulator URL. |
| Acceptance Harness | `APEX_BEARER_TOKEN` | Required | GitHub Actions secret | Apex write token used during acceptance. |
| Acceptance Harness | `APEX_READONLY_TOKEN` | Optional | GitHub Actions secret | Optional read-only Apex token. |
| Acceptance Harness | `FREIGHTBRIDGE_BASE_URL` | Required | GitHub Actions secret/configuration | Deployed FreightBridge API URL. |
| Acceptance Harness | `MIDWEST_BASE_URL` | Required | GitHub Actions secret/configuration | Deployed Midwest simulator URL. |
| Acceptance Harness | `MIDWEST_BEARER_TOKEN` | Required | GitHub Actions secret | Midwest write token used during acceptance. |
| Acceptance Harness | `MIDWEST_READONLY_TOKEN` | Optional | GitHub Actions secret | Optional read-only Midwest token. |
| Acceptance Harness | `OPERATIONS_API_BEARER_TOKEN` | Required for Milestone 22 | GitHub Actions secret | Unlocks protected FreightBridge operations/configuration/Lab APIs. |
| Acceptance Harness | `ANALYST_UI_BASE_URL` | Required for Milestone 22 | GitHub Actions variable | Deployed Vercel Analyst Console URL. |
| Acceptance Harness | `DATABASE_URL` | Optional; not used by Milestone 22 | GitHub Actions secret | Direct SQL verification for older acceptance milestones only. |

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
