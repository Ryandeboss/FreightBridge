# Apex Partner Simulator

Apex Logistics is a synthetic REST/JSON trading-partner backend for the FreightBridge portfolio lab.

It is intentionally separate from the FreightBridge canonical domain. The simulator owns its own API models, bearer-token authentication, repository layer, and PostgreSQL schema under `apex_sim`.

For portfolio cost and deployment simplicity, Apex may use the same physical Supabase PostgreSQL service as FreightBridge. Logical isolation is maintained by keeping Apex data in `apex_sim.*` and never querying FreightBridge `public` domain tables from Apex code.

## Local Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload
```

## Environment

Copy `.env.example` to `.env` for local development.

- `APP_ENV`
- `DATABASE_URL`
- `APEX_API_BEARER_TOKEN`
- `APEX_API_READONLY_TOKEN`
- `FREIGHTBRIDGE_API_BASE_URL`
- `FREIGHTBRIDGE_APEX_BEARER_TOKEN`

`APEX_API_READONLY_TOKEN` is optional. When configured, it can call `GET` endpoints but receives `403` for write operations.

## Endpoints

- `GET /health`
- `GET /readiness`
- `POST /v1/load-tenders`
- `POST /v1/load-tenders/{loadId}/dispatch`
- `GET /v1/loads/{loadId}`
- `POST /v1/tender-responses`
- `POST /v1/shipment-statuses`
- `GET /v1/loads/{loadId}/shipment-statuses`

Apex can explicitly dispatch a stored load tender to FreightBridge over HTTP. It also receives tender responses and shipment statuses from FreightBridge as REST/JSON. No X12 or SFTP behavior is implemented inside Apex.
