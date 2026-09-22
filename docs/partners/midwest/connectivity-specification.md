# Midwest Carrier Connectivity Specification

This document describes the future SFTP integration for synthetic Midwest Carrier. Railway/SFTPGo must not be configured or activated during this milestone.

Milestone 9 adds a temporary direct HTTPS endpoint on the Midwest simulator for development and integration testing:

```text
POST /v1/edi/inbound/204
```

Milestone 10 adds the temporary reverse path:

```text
POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-direct
POST /api/integrations/midwest/tender-responses
```

These endpoints accept/send raw X12 over HTTP so FreightBridge can exercise an end-to-end 204/990 tender flow before SFTP exists. They are not the final Midwest production transport contract.

## Transport

- Protocol: SFTP
- Authentication: SSH key
- Transport encryption: SSH
- Future deployment: Railway-hosted SFTPGo
- Host placeholder: `sftp.midwest-carrier.example.com`
- Port placeholder: `22`
- Username placeholder: `mwcx_freightbridge`

No real hosts, IP addresses, passwords, ports, private keys, or credentials are included in this repository.

Temporary test harness:

- Protocol: HTTPS
- Authentication: bearer token
- FreightBridge outbound 204 endpoint: `POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-direct`
- Midwest inbound 204 endpoint: `POST /v1/edi/inbound/204`
- Midwest outbound 990 endpoint: `POST /v1/loads/{customer_shipment_number}/tender-response/dispatch-direct`
- FreightBridge inbound 990 endpoint: `POST /api/integrations/midwest/tender-responses`
- Payload format: raw `application/edi-x12`
- Replacement target: future SFTP delivery

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
- `MWCX_APEX_997_000000908.edi`

## Duplicate Handling

- File names should be unique per transaction/control number.
- Duplicate file names should not be overwritten.
- Duplicate business identifiers inside new files should be handled by future transaction-processing logic, not by SFTP alone.

## Archive Expectations

- A file successfully consumed from `/inbound` should be moved or copied to `/archive`.
- Archive retention is a future operational policy.
- Archive files must not contain real freight data in this portfolio lab.

## Error Folder Behavior

- Files that cannot be parsed, validated, or correlated should be moved to `/error`.
- Error handling should preserve the original file name where possible.
- Detailed error information should avoid credentials, connection strings, SSH keys, and stack traces.

## Retry Expectations

- Transport retries are future implementation behavior.
- Conceptually, retries should use bounded attempts and avoid duplicate processing.
- Midwest outbound files should remain available until FreightBridge confirms pickup in a future milestone.
