# Midwest Carrier Connectivity Specification

This document describes the production-style SFTP integration for synthetic Midwest Carrier and the temporary REST harness that remains available for regression testing.

Milestone 9 adds a temporary direct HTTPS endpoint on the Midwest simulator for development and integration testing:

```text
POST /v1/edi/inbound/204
```

Milestone 10 adds the temporary reverse path:

```text
POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-direct
POST /api/integrations/midwest/tender-responses
```

These endpoints accept/send raw X12 over HTTP so FreightBridge can exercise the end-to-end 204/990 tender flow without SFTP. They are test harness endpoints, not the production-style Midwest transport contract.

Milestone 11 adds SFTP:

```text
POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-sftp
POST /v1/sftp/inbound/poll
POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-sftp
POST /api/integrations/midwest/sftp/outbound/poll
```

Milestone 12 extends `/outbound` polling to X12 214 shipment-status files:

```text
POST /v1/loads/{customer_shipment_number}/shipment-events
POST /v1/loads/{customer_shipment_number}/shipment-events/{event_id}/dispatch-sftp
GET /v1/loads/{customer_shipment_number}/shipment-events
GET /v1/loads/{load_id}/shipment-statuses
```

Milestone 13 extends `/outbound` polling to X12 997 functional acknowledgment files:

```text
GET /v1/loads/{customer_shipment_number}/functional-acknowledgments
POST /v1/functional-acknowledgments/{outbound_document_id}/dispatch-sftp
GET /api/integrations/midwest/load-tenders/{shipment_number}/functional-acknowledgment
```

## Transport

- Protocol: SFTP
- Authentication: SSH key
- Transport encryption: SSH
- Deployment: Railway-hosted SFTPGo
- SFTPGo image: `ghcr.io/drakkan/sftpgo:2.7.x`
- Internal SFTP port: `2022`
- Web Admin port: `8080`
- External host/port: Railway TCP proxy values
- Username placeholder: `mwcx_freightbridge`
- Host-key verification: required SHA256 fingerprint match
- Client policy: no trust-on-first-use and no Paramiko `AutoAddPolicy`

No real hosts, IP addresses, passwords, ports, private keys, or credentials are included in this repository.

Temporary test harness:

- Protocol: HTTPS
- Authentication: bearer token
- FreightBridge outbound 204 endpoint: `POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-direct`
- Midwest inbound 204 endpoint: `POST /v1/edi/inbound/204`
- Midwest outbound 990 endpoint: `POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-direct`
- FreightBridge inbound 990 endpoint: `POST /api/integrations/midwest/tender-responses`
- Payload format: raw `application/edi-x12`
- SFTP equivalent: use the `/dispatch-sftp` and `/sftp/.../poll` endpoints
- Status: retained for regression and smoke testing

## Directory Perspective

Directories are described from Midwest Carrier's SFTP account perspective:

| Directory | Meaning |
| --- | --- |
| `/inbound` | Files FreightBridge sends TO Midwest |
| `/outbound` | Files Midwest sends TO FreightBridge |
| `/archive` | Successfully processed files retained by the owning side |
| `/error` | Files rejected by transport, syntax, validation, or processing checks |

## File Naming

Deterministic naming convention:

- `APEX_MWCX_204_<control-number>.edi`
- `MWCX_APEX_990_<control-number>.edi`
- `MWCX_APEX_214_<control-number>.edi`
- `MWCX_APEX_997_<control-number>.edi`

Examples:

- `APEX_MWCX_204_000000905.edi`
- `MWCX_APEX_990_000000906.edi`
- `MWCX_APEX_214_000000907.edi`
- `MWCX_APEX_997_000000917.edi`

## Duplicate Handling

- File names should be unique per transaction/control number.
- Duplicate file names are not overwritten; upload conflict is treated as deterministic duplicate protection.
- Duplicate business identifiers inside new files are handled by parser/repository validation and return/load audit state.

## Archive Expectations

- A file successfully consumed from `/inbound` or `/outbound` is moved to `/archive`.
- Archive retention is a future operational policy.
- Archive files must not contain real freight data in this portfolio lab.

## Error Folder Behavior

- Files that cannot be parsed, validated, or correlated should be moved to `/error`.
- Error handling should preserve the original file name where possible.
- Detailed error information should avoid credentials, connection strings, SSH keys, and stack traces.

## Retry Expectations

- Manual poll endpoints process currently available files.
- Transient transport failures leave files in place for retry after configuration or network repair.
- Deterministic syntax, envelope, business validation, and duplicate failures move files to `/error`.
- Background polling and automated retry scheduling are explicitly deferred.

## Operational Runbook

Railway/SFTPGo setup and manual LOAD502 acceptance steps are documented in:

- [SFTPGo Railway runbook](../../operations/sftpgo-railway-runbook.md)
