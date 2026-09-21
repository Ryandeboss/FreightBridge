# Canonical Data Model

FreightBridge uses an internal canonical model so partner-specific payloads do not become the application's core business model.

The model is independent from:

- Apex Logistics REST/JSON field names.
- Midwest Carrier X12/SFTP segments and carrier-side field names.
- Future parser, generator, simulator, and mapping implementations.

Partner mappings will be designed later. This milestone defines only the internal destination concepts those mappings will eventually populate.

## Why Canonical Exists

Apex and Midwest represent similar freight concepts differently. FreightBridge needs stable internal concepts for shipments, stops, references, tender decisions, shipment events, integration transactions, logs, and errors.

This gives future mapping code a clean target:

```text
Partner payload
  -> future partner-specific mapping
  -> FreightBridge canonical model
  -> future partner-specific mapping
  -> partner payload
```

## Not Apex

Apex uses camelCase JSON such as `loadId`, `bolNumber`, and nested `pickup` / `delivery` objects. FreightBridge uses snake_case field names and separates the internal UUID from the business shipment number.

## Not Midwest

Midwest uses X12 concepts such as B2, L11, AT7, interchange control numbers, and future SFTP files. FreightBridge stores canonical business concepts and integration metadata without treating raw X12 segments as the domain model.

## Internal ID vs Business Number

- `shipment_id`: FreightBridge internal UUID and database primary key.
- `shipment_number`: business shipment identifier, such as `LOAD500`.

`LOAD500` is not the primary key.

## Stops

The Python model exposes:

- `origin`
- `destination`

The database stores normalized rows in `shipment_stops`:

- stop 1 = `PICKUP`
- stop 2 = `DELIVERY`

This keeps the schema open for additional stops later.

## References

FreightBridge stores normalized shipment references instead of creating dedicated columns for every reference type.

Initial reference types:

- `BOL`
- `PO`
- `CUSTOMER_REFERENCE`

## Tender Status vs Shipment Status

Tender/business-decision state is separate from physical shipment movement.

Tender status:

- `PENDING`
- `ACCEPTED`
- `REJECTED`

Shipment operational status:

- `PLANNED`
- `PICKED_UP`
- `IN_TRANSIT`
- `ARRIVED`
- `DELIVERED`

`ACCEPTED` and `REJECTED` are never movement statuses.

## Event History

Every status event belongs in `shipment_events`. Normal processing should treat shipment events as historical and immutable.

- `occurred_at`: when the real business event happened.
- `received_at`: when FreightBridge received the message.

A late historical event can be stored without changing the current shipment status.

## Status Progression

Canonical progression:

```text
PLANNED -> PICKED_UP -> IN_TRANSIT -> ARRIVED -> DELIVERED
```

Current status advances only when domain logic permits it:

- Older event timestamps never replace newer current status.
- Newer timestamps advance only when the incoming status is the same or later in progression.
- Equal timestamps advance only when the incoming status is later in progression; exact ties do not rewrite current state.

Example:

- Current: `DELIVERED` at 14:30.
- Incoming: `ARRIVED` at 13:45, received at 14:40.
- Result: store the `ARRIVED` event; keep current status as `DELIVERED`.

## Transaction Correlation

`integration_transactions` tracks API messages and future files flowing through FreightBridge.

It supports:

- correlation IDs
- partner identity
- transport and format
- document type
- business identifier
- optional X12 control numbers
- processing status and stage
- parent transaction relationship

Raw partner payloads are not stored directly in this table. Future raw payload storage should use a separate location such as Supabase Storage.

## Example Canonical Representation

This is a conceptual example using canonical field names. It is not a mapping rule from Apex or Midwest.

```json
{
  "shipment_number": "LOAD500",
  "equipment_type": "DRY_VAN_53",
  "weight_lbs": "42000",
  "pieces": 22,
  "commodity_description": "Packaged auto parts",
  "origin": {
    "facility_name": "ABC Factory",
    "address_line_1": "200 Industrial Rd",
    "address_line_2": "Dock 4",
    "city": "Aurora",
    "state": "IL",
    "postal_code": "60505",
    "scheduled_at": "2026-10-01T14:00:00Z"
  },
  "destination": {
    "facility_name": "XYZ Warehouse",
    "address_line_1": "900 Commerce St",
    "address_line_2": null,
    "city": "Detroit",
    "state": "MI",
    "postal_code": "48201",
    "scheduled_at": "2026-10-02T18:00:00Z"
  },
  "references": [
    { "reference_type": "BOL", "reference_value": "BOL900" },
    { "reference_type": "PO", "reference_value": "PO111" },
    { "reference_type": "CUSTOMER_REFERENCE", "reference_value": "CUST-REF-500" }
  ],
  "tender_status": "PENDING",
  "current_status": "PLANNED",
  "current_status_occurred_at": null
}
```
