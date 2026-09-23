# Idempotency, Replay, And Manual Retry

FreightBridge separates five reliability concepts:

- Business duplicate: the same business object is submitted without an idempotency key. Example: Apex sends `LOAD700` twice without `Idempotency-Key`; the second request remains `409 DUPLICATE_SHIPMENT`.
- API idempotency: the caller supplies `Idempotency-Key`; the same semantic request returns the original safe result and does not repeat the side effect.
- X12 replay: an inbound partner document arrives again with the same partner, direction, document type, ISA13, GS06, ST02, and payload hash. FreightBridge audits the replay and skips business mutation.
- Control-number conflict: the same X12 controls arrive with different payload bytes. FreightBridge rejects it with `X12_CONTROL_NUMBER_REUSE`.
- Retry: an operator deliberately resends an exact stored outbound payload for a failed retryable transaction.

## REST Idempotency

Supported keyed operations:

- `POST /api/integrations/apex/load-tenders`
- `POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-sftp`

The key must be non-empty, printable, and at most 120 characters. Keys are scoped by partner, direction, document type, and operation. Reusing the same key with a different semantic request returns `409 IDEMPOTENCY_KEY_REUSE`.

Example:

- Request 1: `Idempotency-Key: ABC123`, `LOAD700` -> processed.
- Request 2: `Idempotency-Key: ABC123`, same `LOAD700` payload -> original result replayed; no duplicate shipment.
- Request 3: `Idempotency-Key: ABC123`, different `LOAD701` payload -> `409 IDEMPOTENCY_KEY_REUSE`.

## Retry

Retry is manual only. `retryable=true` means a failure class may be retried; it does not start a background worker.

Supported retry matrix:

- Direction: `OUTBOUND`
- Transport: `SFTP`
- Format: `X12`
- Document type: `204`
- Status: original transaction is `FAILED`
- Error: unresolved and `retryable=true`
- Payload: exact snapshot exists in `integration_message_payloads`
- Limit: three attempts

Endpoint:

`POST /api/operations/transactions/{transaction_id}/retry`

The endpoint is protected by `OPERATIONS_API_BEARER_TOKEN`.

Successful retry creates a child transaction. The original transaction remains `FAILED`; its retryable error is resolved with `resolved_by_transaction_id` pointing at the successful retry child.

Example:

- Transaction `T1`: outbound 204 delivery failed with retryable transport error.
- Operator retry creates `T2`, `parent_transaction_id = T1`.
- `T2` sends the exact original X12 payload and succeeds.
- `T1` remains `FAILED`; the original error is resolved by `T2`.

There are no automatic retry workers, retry schedules, or failure-injection hooks in Milestone 15.
