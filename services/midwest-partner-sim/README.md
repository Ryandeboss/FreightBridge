# Midwest Carrier Simulator

Synthetic Midwest Carrier backend for the FreightBridge portfolio lab.

Implemented scope:

- FastAPI service with `/health` and `/readiness`.
- Protected direct test-harness endpoint for raw X12 204 receipt: `POST /v1/edi/inbound/204`.
- Protected SFTP inbound poll endpoint: `POST /v1/sftp/inbound/poll`.
- Protected SFTP 990 dispatch endpoint: `POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-sftp`.
- Protected shipment event creation endpoint: `POST /v1/loads/{customer_shipment_number}/shipment-events`.
- Protected shipment event read endpoint: `GET /v1/loads/{customer_shipment_number}/shipment-events`.
- Protected SFTP 214 dispatch endpoint: `POST /v1/loads/{customer_shipment_number}/shipment-events/{event_id}/dispatch-sftp`.
- SFTP readiness endpoint: `GET /v1/sftp/readiness`.
- Midwest-owned load read endpoint: `GET /v1/loads/{customer_shipment_number}`.
- Independent Midwest-side X12 204 parsing and validation.
- Independent Midwest-side X12 214 generation.
- Persistence in the separate `midwest_sim` PostgreSQL schema.

This service intentionally does not import FreightBridge domain models, FreightBridge X12 utilities, Apex simulator models, or FreightBridge repositories.

The HTTP receipt and direct 990 dispatch endpoints are temporary integration-test harnesses. The production-style portfolio transport is SFTP through Railway/SFTPGo.

## Environment

```text
APP_ENV=development
DATABASE_URL=<postgres connection string>
MIDWEST_API_BEARER_TOKEN=<write token>
MIDWEST_API_READONLY_TOKEN=<optional read-only token>
FREIGHTBRIDGE_API_BASE_URL=<FreightBridge API URL>
FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN=<FreightBridge Midwest inbound token>
MWCX_SFTP_HOST=<Railway SFTP TCP host>
MWCX_SFTP_PORT=<Railway SFTP TCP port>
MWCX_SFTP_USERNAME=mwcx_freightbridge
MWCX_SFTP_PRIVATE_KEY_B64=<base64 private key>
MWCX_SFTP_HOST_KEY_SHA256=<SHA256 host-key fingerprint>
```

Do not commit real token or database values.

## Local commands

```bash
pip install -r requirements.txt
python -m pytest
uvicorn app.main:app --reload
```
