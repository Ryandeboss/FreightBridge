# Generic X12 Foundation

FreightBridge now has a small generic X12 structural layer in the FreightBridge API. It is intentionally limited to syntax-level parsing, envelope hierarchy, envelope validation, and serialization.

Implemented module:

```text
services/freightbridge-api/app/integrations/x12/
```

## Scope

The foundation supports:

- ISA delimiter discovery for element, component, segment, and version-dependent repetition separators.
- Structural parsing into immutable interchange, functional group, transaction set, and segment models.
- Envelope validation for ISA/IEA, GS/GE, and ST/SE control-number matches.
- Envelope count validation for IEA01, GE01, and SE01.
- Stable parse and validation error codes.
- Serialization from parsed models back to compact X12 text.

## Explicit Non-Goals

This layer does not implement:

- Midwest-specific business validation.
- X12 204, 990, 214, or 997 semantic mapping.
- Canonical-to-X12 transformation.
- SFTP file pickup or delivery.
- FreightBridge API endpoints.
- Database persistence or migrations.

Those capabilities belong to later milestones.

## Parser Model

The parser creates this hierarchy:

```text
X12Interchange
  ISA segment
  X12FunctionalGroup[]
    GS segment
    X12TransactionSet[]
      ST segment
      body segments
      SE segment
    GE segment
  IEA segment
```

Segments preserve their segment ID, element values, and 1-based position in the parsed payload. Element lookup is 1-based to match X12 notation.

## Midwest Fixtures

The generic parser is tested against the existing Midwest sample payloads in:

```text
sample-data/x12/midwest/
```

These tests prove the generic foundation can parse the documented Midwest X12 004010 examples without adding Midwest-specific transaction mapping.
