# Midwest 214 to Canonical Shipment Event

This mapping is the constrained Midwest Carrier profile used by FreightBridge. It is not a universal ANSI X12 214 implementation guide.

## Envelope

- ISA sender: `MWCX`
- ISA receiver: `FREIGHTBRIDGE`
- ISA version: `00401`
- GS01: `QM`
- GS08: `004010`
- ST01: `214`

## B10 Convention

FreightBridge/Midwest uses this project convention:

| X12 element | Meaning |
| --- | --- |
| `B10-01` | Midwest carrier load number, for example `MWC900503` |
| `B10-02` | FreightBridge/Apex customer shipment number, for example `LOAD503` |
| `B10-03` | Carrier code, `MWCX` |

FreightBridge correlates the canonical shipment from `B10-02`.

## References

| X12 segment | Canonical meaning |
| --- | --- |
| `L11*<value>*BM` | Bill of lading reference |
| `L11*<value>*PO` | Purchase order reference |

## Status

| AT7-01 | Canonical status |
| --- | --- |
| `AF` | `PICKED_UP` |
| `X6` | `IN_TRANSIT` |
| `X1` | `ARRIVED` |
| `D1` | `DELIVERED` |

Unknown AT7 status codes are deterministic mapping failures.

## Event Time

The project profile uses:

| X12 element | Meaning |
| --- | --- |
| `AT7-01` | Status code |
| `AT7-05` | Event date as `YYYYMMDD` |
| `AT7-06` | Event time as `HHMM` |
| `AT7-07` | Time code, required as `UT` |

FreightBridge maps `AT7-05` + `AT7-06` + `AT7-07` to canonical `ShipmentEvent.occurred_at` as an aware UTC datetime.

`ShipmentEvent.received_at` is not taken from X12. It is the time FreightBridge processes the SFTP file.

## Location

`MS1-01` maps to event city. `MS1-02` maps to event state and must be a two-letter uppercase state code.

## Current Status

Every valid 214 creates an append-only canonical `shipment_events` row. FreightBridge then applies the existing canonical status progression rule:

- Older `occurred_at` events never replace newer current status.
- Equal timestamps advance only when the incoming status is later in the canonical progression.
- Newer timestamps advance only when the incoming status is the same or later in progression.

This means event history can differ from current-state mutation order. A late `ARRIVED` event with an earlier business timestamp than an already processed `DELIVERED` event is retained in history but does not regress `shipments.current_status`.
