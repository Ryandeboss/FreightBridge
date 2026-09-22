# Midwest Carrier Simulator

Synthetic Midwest Carrier backend for the FreightBridge portfolio lab.

Implemented scope:

- FastAPI service with `/health` and `/readiness`.
- Protected direct test-harness endpoint for raw X12 204 receipt: `POST /v1/edi/inbound/204`.
- Midwest-owned load read endpoint: `GET /v1/loads/{customer_shipment_number}`.
- Independent Midwest-side X12 204 parsing and validation.
- Persistence in the separate `midwest_sim` PostgreSQL schema.

This service intentionally does not import FreightBridge domain models, FreightBridge X12 utilities, Apex simulator models, or FreightBridge repositories.

The HTTP receipt endpoint is a temporary integration-test harness. Future production-style Midwest transport remains SFTP.

## Environment

```text
APP_ENV=development
DATABASE_URL=<postgres connection string>
MIDWEST_API_BEARER_TOKEN=<write token>
MIDWEST_API_READONLY_TOKEN=<optional read-only token>
```

Do not commit real token or database values.

## Local commands

```bash
pip install -r requirements.txt
python -m pytest
uvicorn app.main:app --reload
```
