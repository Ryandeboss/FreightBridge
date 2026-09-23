# Integration Error Contract

This document defines conceptual error categories for future FreightBridge integrations. It does not implement error handling or acknowledgments.

Errors must not expose stack traces, bearer tokens, SSH keys, database URLs, Supabase credentials, file-system paths containing secrets, or private implementation details.

## Error Categories

| Category | Description | Potential source layer |
| --- | --- | --- |
| `TRANSPORT_ERROR` | HTTPS, SFTP, network, timeout, or file-transfer failure | Apex transport, Midwest SFTP, FreightBridge transport |
| `AUTHENTICATION_ERROR` | Missing or invalid bearer token or SSH identity | Apex API, future SFTP gateway, FreightBridge |
| `AUTHORIZATION_ERROR` | Authenticated party lacks permission | Apex API, future SFTP gateway, FreightBridge |
| `SYNTAX_ERROR` | Malformed JSON, invalid X12 envelope, unreadable file | Apex REST input, Midwest EDI validation, FreightBridge parsers |
| `UNSUPPORTED_VERSION` | Unsupported API version or X12 version | Apex `/v1`, Midwest 004010 profile, FreightBridge |
| `MAPPING_ERROR` | Future canonical or partner transformation failed | FreightBridge mapping layer |
| `BUSINESS_VALIDATION_ERROR` | Required business data missing or invalid | Apex, Midwest, FreightBridge business validation |
| `DUPLICATE_TRANSACTION` | Duplicate control number, load ID, or file name | FreightBridge, Midwest EDI gateway, partner systems |
| `DOWNSTREAM_ERROR` | Dependency or partner system failed after request was accepted | FreightBridge, Apex, Midwest |

## REST Error Envelope

Future REST APIs should use a safe JSON envelope:

```json
{
  "error": {
    "code": "BUSINESS_VALIDATION_ERROR",
    "message": "Required destination information is missing.",
    "correlationId": "corr-LOAD500-001"
  }
}
```

Guidelines:

- `code` should use one of the categories above or a documented partner-specific subcode.
- `message` should be safe for logs and UI display.
- `correlationId` should connect related log entries and partner messages without revealing secrets.

## EDI Failure Handling

EDI rejection and acknowledgment behavior depends on where the failure occurs:

| Failure stage | Conceptual behavior |
| --- | --- |
| Transport | Future retry or file placement in `/error`; no EDI acknowledgment if the file was never received |
| X12 syntax | 997 rejection may be appropriate when the envelope and original controls can be identified; otherwise `/error` placement is acceptable |
| EDI validation | 997 or partner-specific error handling depending on segment-level failure |
| Business processing | Future business-level rejection, such as 990 decline or processing error, separate from 997 |

997 is implemented only for the constrained Midwest 204 acknowledgment profile. TA1, 999, AS2 MDN, and broad failure-injection acknowledgment handling remain out of scope.

## Operational Resolution

Resolving an `integration_errors` row means a support user reviewed or closed the queue item. It does not change the associated transaction, retry the message, repair shipment/tender state, or imply partner delivery. Resolved failed transactions remain historically `FAILED`.

Milestone 14 adds optional `resolution_note` for this support action. Notes are capped at 500 characters and must not contain secrets or raw payloads.
