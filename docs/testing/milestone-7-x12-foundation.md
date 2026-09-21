# Milestone 7 Generic X12 Foundation Acceptance

This milestone adds only a generic X12 structural foundation inside the FreightBridge API.

Midwest business processing, SFTP workflows, X12-to-canonical mapping, API endpoints, and database writes are intentionally deferred.

## Implemented

- Generic X12 delimiter discovery from ISA.
- Generic X12 segment parsing.
- Interchange, functional group, and transaction set hierarchy models.
- ISA/IEA, GS/GE, and ST/SE envelope validation.
- Control-number and segment/group/transaction count validation.
- Serializer for parsed X12 documents.
- Stable parse and validation error codes.

## Acceptance Coverage

FreightBridge API tests verify:

- All Midwest sample X12 fixtures parse as generic X12.
- Midwest X12 004010 delimiters are discovered as `*`, `~`, and `:`.
- 004010 repetition separator is not treated as active.
- Round-trip serialization preserves segment IDs and elements.
- Custom delimiters are discovered from ISA.
- Multiple transaction sets in one functional group are supported.
- Multiple functional groups in one interchange are supported.
- Malformed ISA and unexpected envelope segments produce stable parse errors.
- Missing SE, GE, and IEA trailers produce stable parse errors.
- ISA/IEA, GS/GE, and ST/SE control-number mismatches produce stable validation errors.
- Incorrect SE, GE, and IEA counts produce stable validation errors.

## Test Commands

```bash
cd services/freightbridge-api
pytest

cd ../apex-partner-sim
pytest

cd ../../apps/analyst-ui
npm run lint
npm run build
```

## Deferred Work

- Midwest 204 outbound generation.
- Midwest 990 inbound business response processing.
- Midwest 214 inbound shipment status processing.
- 997 generation or handling beyond structural parsing.
- SFTP transport.
- Raw EDI storage and database audit integration.
