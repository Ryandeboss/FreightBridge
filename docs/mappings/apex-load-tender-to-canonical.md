# Apex Load Tender to Canonical Shipment Mapping

This document describes the implemented Milestone 6 mapper from Apex Logistics REST/JSON load tenders to FreightBridge canonical shipments.

The mapper lives in `services/freightbridge-api/app/integrations/apex/mapper.py`. It is partner-specific and intentionally not a generic configurable mapping engine.

| Source system | Source field | Source type | Canonical destination | Transformation | Required? | Failure behavior | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Apex | `loadId` | string | `CanonicalShipment.shipment_number` | trim/validate through boundary model | Yes | 422 validation failure | Example `LOAD500` |
| Apex | `equipmentType` | enum | `equipment_type` | `VAN_53` -> `DRY_VAN_53`; `REEFER_53` -> `REFRIGERATED_53`; `FLATBED` -> `FLATBED` | Yes | 422 validation or mapping failure | Midwest X12 equipment codes are not used here |
| Apex | `weightLbs` | number | `weight_lbs` | decimal conversion | Yes | 422 validation failure | Must be positive |
| Apex | `pieces` | integer | `pieces` | direct copy | No | 422 validation failure if non-positive | Null allowed |
| Apex | `commodityDescription` | string | `commodity_description` | direct copy | Yes | 422 validation failure | |
| Apex | `pickup.*` | object | `origin` | field-by-field location mapping | Yes | 422 validation failure | State must be 2 uppercase letters |
| Apex | `delivery.*` | object | `destination` | field-by-field location mapping | Yes | 422 validation failure | |
| Apex | `bolNumber` | string | `ShipmentReference(BOL)` | create canonical reference | Yes | 422 validation failure | |
| Apex | `purchaseOrderNumber` | string | `ShipmentReference(PO)` | create canonical reference when present | No | ignored when absent | |
| Apex | `customerReference` | string | `ShipmentReference(CUSTOMER_REFERENCE)` | create canonical reference when present | No | ignored when absent | |
| Apex | `references[].type=BOL` | object | `ShipmentReference(BOL)` | add if not duplicate | No | 422 if reference shape invalid | Duplicates are deduplicated by `(type, value)` |
| Apex | `references[].type=PO` | object | `ShipmentReference(PO)` | add if not duplicate | No | 422 if reference shape invalid | |
| Apex | `references[].type=CUSTOMER_REF` | object | `ShipmentReference(CUSTOMER_REFERENCE)` | add if not duplicate | No | 422 if reference shape invalid | |
| Apex | `references[].type=APPOINTMENT` | object | none | intentionally ignored | No | not a failure | Canonical model has no appointment reference type yet; processing-log metadata notes ignored reference type |
| Apex | `createdAt`, `updatedAt` | date-time | validation only | timezone-aware validation; `updatedAt >= createdAt` | Yes | 422 validation failure | Not copied to canonical shipment timestamps |

## Persistence Result

A successful Apex load tender creates:

- one `shipments` row
- one pickup and one delivery row in `shipment_stops`
- canonical references in `shipment_references`
- one successful inbound `integration_transactions` row
- processing logs for received, authentication, parsing, validation, mapping, business validation, and completed stages

No X12, Midwest, SFTP, or generic mapping behavior is implemented by this mapper.
