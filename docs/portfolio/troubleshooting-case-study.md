# Troubleshooting Case Study

FreightBridge's controlled failure drills show how different integration failures are classified and diagnosed.

## Primary Example: Unsupported 214 Status

Drill: `X12_214_UNSUPPORTED_STATUS`

Conceptual chain:

1. The Integration Lab creates a synthetic Midwest `214` with an unsupported `AT7` code such as `ZZ`.
2. Generic X12 parsing succeeds because the file is structurally parseable.
3. X12 envelope validation succeeds because control numbers and counts are valid.
4. Midwest business mapping fails because the current Midwest profile supports only `AF`, `X6`, `X1`, and `D1`.
5. FreightBridge records a failed `IntegrationTransaction`.
6. FreightBridge records an `IntegrationError` with:
   - Error code: `UNSUPPORTED_AT7_CODE`
   - Category: `MAPPING_ERROR`
   - Stage: `MAPPING`
7. The failure appears in the Analyst Console failure queue.
8. The analyst can open failure detail, transaction detail, timeline logs, correlation id, and mapping-stage context.

This demonstrates layer-by-layer troubleshooting. A structurally valid X12 message can still fail partner business mapping.

## Parsing Vs Contract Validation

`APEX_INVALID_JSON` and `APEX_INVALID_CONTRACT` intentionally fail at different layers.

`APEX_INVALID_JSON`:

- The JSON body is malformed.
- Parsing fails before Pydantic contract validation.
- The failure is a syntax/parsing problem.

`APEX_INVALID_CONTRACT`:

- JSON parsing succeeds.
- The payload violates the documented Apex contract or business requirements.
- The failure is a validation/business-contract problem.

This distinction matters because analysts should not diagnose all bad partner messages the same way.

## Authentication Before Business Identity

`APEX_BAD_AUTH` fails before FreightBridge can trust the request as a business document. An `IntegrationTransaction` may exist for audit, but `businessIdentifier` can legitimately be null. FreightBridge should not invent a synthetic load id for a request that failed authentication.

## SFTP Host-Key Boundary

`SFTP_HOST_KEY_MISMATCH` demonstrates host-key pinning. A mismatch can occur before an IntegrationTransaction exists because the transport boundary itself was not trusted. That is expected: the system should not process or classify a file as business data until the SFTP connection is verified.

## What The Analyst Console Proves

The console turns these failures into a support workflow:

- Dashboard: high-level health and recent operational state.
- Transactions: searchable message and operation history.
- Transaction Detail: processing timeline, payload metadata, mapping audit, and retry context.
- Failures: filtered queue of unresolved errors.
- Failure Detail: safe error code, category, stage, retryability, and related transaction.
- Business Trace: all known records for a load/shipment identifier.
- Integration Lab: repeatable happy paths and expected failure drills.
