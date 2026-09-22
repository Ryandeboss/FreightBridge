# Midwest 204 Generation Architecture

Milestone 8 adds the first outbound EDI business transformation:

```text
Apex JSON
  -> Apex-specific mapper
  -> CanonicalShipment
  -> Midwest-specific 204 mapper
  -> Generic X12 structural model
  -> Generic X12 serializer
  -> X12 204 text
```

The canonical model isolates partner schemas. Apex JSON field names do not leak into the Midwest mapper, and Midwest X12 segment names do not become domain model fields.

## Layer Boundaries

| Layer | Responsibility |
| --- | --- |
| Apex integration | Validate Apex JSON and map it to `CanonicalShipment` |
| Canonical domain | Store stable shipment, stop, reference, status, and audit concepts |
| Midwest 204 integration | Apply Midwest-specific business rules and create X12 structural objects |
| Generic X12 foundation | Parse, validate, model, and serialize X12 envelopes without partner business rules |

The generic X12 package does not import Midwest code.

## Control Numbers

Milestone 8 introduces a small control-number provider abstraction for:

- ISA13 interchange control number
- GS06 / GE02 group control number
- ST02 / SE02 transaction control number

Tests use fixed deterministic values so LOAD500 can reproduce the approved fixture. Runtime generation uses a timestamp-derived provider that produces a zero-padded 9-digit ISA control number, a numeric group control number, and transaction control number `0001`.

This is acceptable for the current generation-only preview flow. A stronger durable allocator belongs with the future outbound transport/persistence milestone.

## ISA Generation

The Midwest mapper generates a fixed-width ISA compatible with the generic delimiter discovery logic:

- Sender: `FREIGHTBRIDGE`
- Receiver: `MWCX`
- ISA12: `00401`
- ISA15: `T`
- ISA16 component separator: `:`

Sender and receiver identifiers are padded to the project profile widths, and generated payloads are parsed back through the generic X12 parser in tests.

## Preview Endpoint

The API exposes a generation-only endpoint:

```text
POST /api/integrations/midwest/load-tenders/{shipment_number}/generate
```

The endpoint fetches the canonical shipment, generates a Midwest 204, validates the envelope, and returns metadata plus serialized X12. It does not send a file, create SFTP credentials, or mark an outbound delivery as complete.

Milestone 9 adds a separate direct test-harness endpoint:

```text
POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-direct
```

This endpoint generates the same Midwest 204 and delivers it to the independent Midwest simulator over HTTPS as raw `application/edi-x12`. The transport is named `REST_TEST_HARNESS` in responses and audit logs.

Milestone 11 adds the production-style SFTP route:

```text
POST /api/integrations/midwest/load-tenders/{shipment_number}/dispatch-sftp
```

This endpoint generates the Midwest 204, writes `APEX_MWCX_204_<ISA13>.edi` atomically to SFTP `/inbound`, and records the remote path on the outbound integration audit row.

Generation-only preview required no database migration. Direct simulator delivery requires `20260922_003_create_midwest_simulator.sql` for the new `midwest_sim` schema and the temporary REST/X12 audit allowance. SFTP metadata requires `20260922_005_add_sftp_transport_metadata.sql`.
