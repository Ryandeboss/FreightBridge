# Canonical Shipment to Midwest 204 Mapping Requirements

This document is the human-readable Mapping Requirements Specification for the implemented Milestone 8 Midwest 204 generator.

Executable mapping artifact:

```text
services/freightbridge-api/app/integrations/midwest/mappings/204.json
```

Implementation:

```text
services/freightbridge-api/app/integrations/midwest/mapping_204.py
```

This mapping is Midwest-specific. It does not add Midwest business rules to the generic X12 parser, validator, serializer, or structural models.

## Mapping Table

| Canonical source | X12 destination | Transformation | Required? | Qualifier / condition | Failure behavior | Example |
| --- | --- | --- | --- | --- | --- | --- |
| `shipment_number` | `B2-04` | Direct | Yes | `B2-02 = MWCX`, `B2-06 = PP` | `MISSING_SHIPMENT_NUMBER` | `B2**MWCX**LOAD500**PP` |
| `references[BOL].reference_value` | `L11-01` | Direct | Yes | `L11-02 = BM` | `MISSING_BOL_REFERENCE` | `L11*BOL900*BM` |
| `references[PO].reference_value` | `L11-01` | Direct when present | No | `L11-02 = PO`; omit when absent | Not a failure | `L11*PO111*PO` |
| `references[CUSTOMER_REFERENCE]` | None | Intentionally not emitted | No | Current Midwest 204 subset has no configured qualifier | Not a failure | `CUST-REF-500` ignored |
| `origin.scheduled_at` | Pickup `G62-02`, `G62-04` | Convert timezone-aware value to UTC `YYYYMMDD` and `HHMM` | Yes | `G62-01 = 37`, `G62-03 = I` | `MISSING_PICKUP_APPOINTMENT` | `G62*37*20261001*I*1400` |
| `destination.scheduled_at` | Delivery `G62-02`, `G62-04` | Convert timezone-aware value to UTC `YYYYMMDD` and `HHMM` | Yes | `G62-01 = 38`, `G62-03 = K` | `MISSING_DELIVERY_APPOINTMENT` | `G62*38*20261002*K*1800` |
| `origin.facility_name` | Pickup `N1-02` | Direct | Yes | `S5*1*LD`; `N1-01 = SH` | `MISSING_ORIGIN_ADDRESS` | `N1*SH*ABC Factory` |
| `origin.address_line_1` | Pickup `N3-01` | Direct | Yes | Address line 2 is not emitted in current subset | `MISSING_ORIGIN_ADDRESS` | `N3*200 Industrial Rd` |
| `origin.city/state/postal_code` | Pickup `N4-01/02/03` | Direct | Yes | `S5*1*LD` loop | `MISSING_ORIGIN_ADDRESS` | `N4*Aurora*IL*60505` |
| `destination.facility_name` | Delivery `N1-02` | Direct | Yes | `S5*2*UL`; `N1-01 = CN` | `MISSING_DESTINATION_ADDRESS` | `N1*CN*XYZ Warehouse` |
| `destination.address_line_1` | Delivery `N3-01` | Direct | Yes | Address line 2 is not emitted in current subset | `MISSING_DESTINATION_ADDRESS` | `N3*900 Commerce St` |
| `destination.city/state/postal_code` | Delivery `N4-01/02/03` | Direct | Yes | `S5*2*UL` loop | `MISSING_DESTINATION_ADDRESS` | `N4*Detroit*MI*48201` |
| `weight_lbs` | `L3-01` | Decimal to X12 numeric text | Yes | `L3-02 = G` | `MISSING_WEIGHT` | `L3*42000*G***22` |
| `pieces` | `L3-05` | Integer text | Yes for current Midwest fixture profile | Do not fabricate when absent | `MISSING_PIECES` | `22` |
| `equipment_type` | None | Intentionally not emitted | No | Existing Midwest 204 subset does not define an equipment destination segment | Not a failure | `DRY_VAN_53` ignored |

## Timestamp Policy

Canonical appointment timestamps must be timezone-aware. The synthetic Midwest profile formats the canonical timestamp in UTC and does not infer local time from city/state. This preserves the LOAD500 fixture convention where `2026-10-01T14:00:00Z` becomes `G62*37*20261001*I*1400`.

## Envelope Policy

The Midwest 204 mapper creates X12 structural objects first:

```text
X12Segment
X12TransactionSet
X12FunctionalGroup
X12Interchange
```

It then serializes through the generic X12 serializer and validates the generated output by parsing it through the generic X12 parser and envelope validator.

SE, GE, and IEA counts are derived from the generated structure. They are not hardcoded from the LOAD500 fixture.

## Audit Decision

The Milestone 8 endpoint only generates and previews a Midwest 204. It does not deliver a file to Midwest, so it does not create an outbound `integration_transactions` row. Generation is not treated as delivery. Outbound audit persistence will be revisited when SFTP delivery exists.

## Deferred

- SFTP upload.
- Midwest simulator behavior.
- 990 tender response processing.
- 214 shipment status processing.
- 997 generation or inbound handling.
- Durable distributed X12 control-number allocation.
