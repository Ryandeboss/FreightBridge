# Operational Observability And Failure Queue

Milestone 14 turns FreightBridge's existing integration persistence into a support-facing operations API. The source of truth remains:

- `integration_transactions`
- `processing_logs`
- `integration_errors`

No duplicate logging architecture is introduced.

## Concepts

An `integration_transaction` is one integration message or delivery attempt. It records partner, direction, transport, message format, document type, business identifier, correlation ID, status, stage, control numbers, parent transaction, and safe payload location metadata.

A `processing_log` is a timeline entry for a transaction. Logs answer what stage was reached and what happened there.

An `integration_error` is a classified operational failure attached to a transaction. Errors feed the operations queue.

`category` is the broad operational classification, such as `DUPLICATE_TRANSACTION` or `TRANSPORT_ERROR`.

`error_code` is the specific failure, such as `DUPLICATE_SHIPMENT`, `INVALID_JSON`, or `ACKNOWLEDGED_204_NOT_FOUND`.

`processing_status` is the outcome or lifecycle state: `RECEIVED`, `PROCESSING`, `SUCCEEDED`, or `FAILED`.

`processing_stage` is where the transaction is or failed: `RECEIVED`, `AUTHENTICATION`, `PARSING`, `VALIDATION`, `MAPPING`, `BUSINESS_VALIDATION`, `ROUTING`, `DELIVERY`, `ACKNOWLEDGMENT`, or `COMPLETED`.

`correlation_id` is request-level troubleshooting context. `business_identifier` is the cross-flow trace key, such as a load ID.

Parent-child transaction links connect integration flows, for example an inbound 214 to the outbound Apex shipment-status delivery it triggers.

## Error Resolution

Resolving an `integration_error` means an operator reviewed or closed that queue item. It does not mean:

- the failed transaction succeeded
- the message was retried
- the partner received the message
- shipment or tender state changed

A transaction that failed remains historically `FAILED` after its error is resolved.

Reopening an error sets `resolved = false` and clears `resolved_at`. FreightBridge preserves the previous `resolution_note` as audit context.

`retryable` means the failure class is eligible for operator-controlled retry. It does not mean FreightBridge will automatically retry it. Milestone 15 adds a manual retry endpoint for failed outbound SFTP X12 204 transactions only; there is still no retry worker, requeue daemon, or automatic retry behavior.

Successful manual retry creates a child transaction. The original failed transaction remains historically `FAILED`, and its retryable error may be marked resolved with `resolved_by_transaction_id` pointing to the successful retry child.

## Operations API Security

All `/api/operations` endpoints require:

```text
Authorization: Bearer <OPERATIONS_API_BEARER_TOKEN>
```

This is a distinct trust boundary from Apex and Midwest partner tokens. Missing or invalid tokens return `401`.

The Analyst Console is a browser client for these endpoints. Operators enter the token at runtime; it is stored only in session storage and cleared by `Lock Console` or any protected-request `401`. See [Analyst Console](analyst-console.md).

## Safe Metadata

Processing log metadata may include safe operational fields:

- partner code
- shipment/load number
- mapping version
- transport
- document type
- error code
- acknowledgment status

Metadata must not include bearer tokens, authorization headers, private keys, database URLs, Supabase secrets, SFTP credentials, or full raw payloads.

Operations APIs do not return raw payload bodies. `rawPayloadLocation` may be returned only for integration mailbox paths such as `/inbound/...`, `/outbound/...`, `/archive/...`, or `/error/...`.

## API Surface

- `GET /api/operations/transactions`
- `GET /api/operations/transactions/{transaction_id}`
- `POST /api/operations/transactions/{transaction_id}/retry`
- `GET /api/operations/business/{business_identifier}/trace`
- `GET /api/operations/correlations/{correlation_id}`
- `GET /api/operations/errors`
- `GET /api/operations/errors/{error_id}`
- `POST /api/operations/errors/{error_id}/resolve`
- `POST /api/operations/errors/{error_id}/reopen`
- `GET /api/operations/summary`

## Troubleshooting Example

For a duplicate load:

```text
LOAD0923143059A1B2

Transaction 1:
APEX_LOAD_TENDER
SUCCEEDED / COMPLETED

Transaction 2:
APEX_LOAD_TENDER
FAILED / BUSINESS_VALIDATION

Error:
DUPLICATE_TRANSACTION
DUPLICATE_SHIPMENT

Operator:
resolves error in queue

Transaction 2:
still FAILED
```

This is expected. Error resolution is an operational queue action, not a replay or repair action.

## Pre-Transaction Limitations

Some failures can happen before an `integration_transaction` can safely be created, such as database unavailability or trading-partner configuration lookup failure before partner resolution. FreightBridge does not fabricate transaction records when persistence itself is unavailable. Those infrastructure failures are covered by application/stdout logs and safe HTTP error responses.
