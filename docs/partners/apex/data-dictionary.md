# Apex Logistics Data Dictionary

This document defines Apex Logistics source-system objects for the FreightBridge portfolio lab. These are Apex-owned REST/JSON shapes, not FreightBridge canonical models.

All examples are synthetic.

## ApexLoad

| Field | JSON path | Type | Required | Example | Description | Validation notes |
| --- | --- | --- | --- | --- | --- | --- |
| loadId | `loadId` | string | Required | `LOAD500` | Apex primary load identifier | Unique within Apex; 6-30 characters |
| bolNumber | `bolNumber` | string | Required | `BOL900` | Bill of lading reference | Used later for Midwest `REF*BM` |
| purchaseOrderNumber | `purchaseOrderNumber` | string | Optional | `PO111` | Customer purchase order | Used later for Midwest `REF*PO` when present |
| customerReference | `customerReference` | string | Optional | `CUST-REF-500` | Apex customer-facing reference | 1-40 characters |
| equipmentType | `equipmentType` | string | Required | `VAN_53` | Requested equipment | MVP values: `VAN_53`, `REEFER_53`, `FLATBED` |
| weightLbs | `weightLbs` | number | Required | `42000` | Total shipment weight in pounds | Positive number |
| pieces | `pieces` | integer | Optional | `22` | Handling unit count | Positive integer when provided |
| commodityDescription | `commodityDescription` | string | Required | `Packaged auto parts` | Freight commodity description | 1-80 characters |
| pickup | `pickup` | ApexLocation | Required | See ApexLocation | Origin stop | One pickup for MVP |
| delivery | `delivery` | ApexLocation | Required | See ApexLocation | Destination stop | One delivery for MVP |
| references | `references` | ApexReference[] | Optional | See ApexReference | Additional Apex references | Reference types must be known |
| createdAt | `createdAt` | string date-time | Required | `2026-09-19T14:00:00Z` | Apex creation timestamp | ISO 8601 UTC |
| updatedAt | `updatedAt` | string date-time | Required | `2026-09-19T14:05:00Z` | Apex last update timestamp | ISO 8601 UTC; not before `createdAt` |

## ApexLocation

| Field | JSON path | Type | Required | Example | Description | Validation notes |
| --- | --- | --- | --- | --- | --- | --- |
| facilityName | `pickup.facilityName`, `delivery.facilityName` | string | Required | `ABC Factory` | Facility name | 1-60 characters |
| address1 | `pickup.address1`, `delivery.address1` | string | Required | `200 Industrial Rd` | Street address | 1-80 characters |
| address2 | `pickup.address2`, `delivery.address2` | string or null | Optional | `Dock 4` | Secondary address line | Omit or null when absent |
| city | `pickup.city`, `delivery.city` | string | Required | `Aurora` | City | 1-40 characters |
| state | `pickup.state`, `delivery.state` | string | Required | `IL` | Two-letter state | US state abbreviation for MVP |
| postalCode | `pickup.postalCode`, `delivery.postalCode` | string | Required | `60505` | Postal code | US ZIP or ZIP+4 for MVP |
| scheduledDateTime | `pickup.scheduledDateTime`, `delivery.scheduledDateTime` | string date-time | Required | `2026-10-01T14:00:00Z` | Scheduled appointment | ISO 8601 UTC |

## ApexTenderResponse

| Field | JSON path | Type | Required | Example | Description | Validation notes |
| --- | --- | --- | --- | --- | --- | --- |
| loadId | `loadId` | string | Required | `LOAD500` | Apex load identifier being answered | Must reference an existing Apex load |
| decision | `decision` | string | Required | `ACCEPTED` | Tender decision | `ACCEPTED` or `REJECTED` |
| carrierCode | `carrierCode` | string | Required | `MWCX` | Carrier identifier known to Apex | 2-10 characters |
| carrierLoadNumber | `carrierLoadNumber` | string | Optional | `MWC900500` | Carrier-assigned load number | Required when decision is `ACCEPTED` once assigned |
| reasonCode | `reasonCode` | string | Optional | `CAPACITY_UNAVAILABLE` | Rejection reason | Required when decision is `REJECTED` |
| message | `message` | string | Optional | `Tender accepted by Midwest Carrier.` | Human-readable note | Do not parse for logic |
| decidedAt | `decidedAt` | string date-time | Required | `2026-09-19T14:45:00Z` | Decision timestamp | ISO 8601 UTC |

## ApexShipmentStatus

| Field | JSON path | Type | Required | Example | Description | Validation notes |
| --- | --- | --- | --- | --- | --- | --- |
| loadId | `loadId` | string | Required | `LOAD500` | Apex load identifier | Must reference an existing Apex load |
| carrierCode | `carrierCode` | string | Required | `MWCX` | Reporting carrier | 2-10 characters |
| statusCode | `statusCode` | string | Required | `PICKED_UP` | Apex shipment status | MVP values: `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, `DELIVERED` |
| statusDescription | `statusDescription` | string | Optional | `Shipment picked up at origin.` | Human-readable status | Do not parse for logic |
| occurredAt | `occurredAt` | string date-time | Required | `2026-10-01T14:30:00Z` | Status event time | ISO 8601 UTC |
| city | `city` | string | Optional | `Aurora` | Event city | Required when available from partner |
| state | `state` | string | Optional | `IL` | Event state | Two-letter abbreviation when provided |

## ApexReference

| Field | JSON path | Type | Required | Example | Description | Validation notes |
| --- | --- | --- | --- | --- | --- | --- |
| type | `references[].type` | string | Required | `CUSTOMER_REF` | Apex reference type | MVP values: `BOL`, `PO`, `CUSTOMER_REF`, `APPOINTMENT` |
| value | `references[].value` | string | Required | `CUST-REF-500` | Reference value | 1-80 characters |
| description | `references[].description` | string | Optional | `Customer routing reference` | Reference context | Informational only |
