# Midwest Carrier Data Dictionary

This document defines Midwest Carrier-side concepts for the FreightBridge portfolio lab. These concepts represent how a legacy carrier TMS and EDI gateway might view freight. They are not Apex JSON fields and are not FreightBridge canonical fields.

All examples are synthetic.

## Midwest Load Header

| Concept | Midwest field | Type | Required | Example | Description |
| --- | --- | --- | --- | --- | --- |
| Carrier load number | `carrier_load_no` | string | Optional until accepted | `MWC900500` | Midwest internal dispatch load number |
| Customer shipment number | `cust_ship_no` | string | Required | `LOAD500` | Customer or broker shipment identifier received in EDI |
| Bill of lading | `bol_ref` | string | Required | `BOL900` | BOL reference from tender |
| Purchase order reference | `po_ref` | string | Optional | `PO111` | Purchase order reference from tender |
| Equipment code | `equip_code` | string | Required | `DV53` | Midwest equipment code for a 53-foot dry van |
| Gross weight | `gross_weight_lb` | decimal | Required | `42000` | Tendered shipment weight |
| Piece count | `handling_units` | integer | Optional | `22` | Handling unit count |
| Freight description | `freight_desc` | string | Required | `Packaged auto parts` | Commodity description used by dispatch |

## Midwest Party and Stop Data

| Concept | Midwest field | Type | Required | Example | Description |
| --- | --- | --- | --- | --- | --- |
| Shipper name | `shipper_name` | string | Required | `ABC Factory` | Origin facility name |
| Shipper street | `shipper_addr_line_1` | string | Required | `200 Industrial Rd` | Origin street address |
| Shipper city | `shipper_city` | string | Required | `Aurora` | Origin city |
| Shipper state | `shipper_state_cd` | string | Required | `IL` | Origin state |
| Shipper postal code | `shipper_zip` | string | Required | `60505` | Origin postal code |
| Consignee name | `cons_name` | string | Required | `XYZ Warehouse` | Destination facility name |
| Consignee street | `cons_addr_line_1` | string | Required | `900 Commerce St` | Destination street address |
| Consignee city | `cons_city` | string | Required | `Detroit` | Destination city |
| Consignee state | `cons_state_cd` | string | Required | `MI` | Destination state |
| Consignee postal code | `cons_zip` | string | Required | `48201` | Destination postal code |
| Pickup appointment | `pickup_appt_ts` | datetime | Required | `2026-10-01T14:00:00Z` | Scheduled origin appointment |
| Delivery appointment | `delivery_appt_ts` | datetime | Required | `2026-10-02T18:00:00Z` | Scheduled destination appointment |

## Midwest Tender Decision

| Concept | Midwest field | Type | Required | Example | Description |
| --- | --- | --- | --- | --- | --- |
| Tender decision | `tender_decision_cd` | string | Required | `A` | Midwest decision code; `A` accepted, `D` declined |
| Tender decision time | `tender_decision_ts` | datetime | Required | `2026-09-19T14:45:00Z` | Decision timestamp |
| Decline reason | `decline_reason_cd` | string | Conditional | `NO_CAP` | Required when declined |
| Dispatch note | `dispatch_note` | string | Optional | `Accepted by dispatch.` | Internal carrier note |

## Midwest Status History

| Concept | Midwest field | Type | Required | Example | Description |
| --- | --- | --- | --- | --- | --- |
| Status sequence | `status_seq_no` | integer | Required | `1` | Carrier status event sequence |
| EDI status code | `edi_status_cd` | string | Required | `AF` | Supported Midwest AT7-01 status code: `AF`, `X6`, `X1`, or `D1` |
| Internal status | `dispatch_status_cd` | string | Required | `PU` | Midwest internal status |
| Status city | `status_city` | string | Optional | `Aurora` | Event city |
| Status state | `status_state_cd` | string | Optional | `IL` | Event state |
| Event timestamp | `status_event_ts` | datetime | Required | `2026-10-01T14:30:00Z` | Event timestamp |

## Reference Numbers

Midwest stores references as typed rows rather than Apex-style nested fields.

| Reference type | Midwest field | Example | Notes |
| --- | --- | --- | --- |
| Customer shipment | `L11.CS` | `LOAD500` | Often aligns to tender shipment identifier |
| Bill of lading | `L11.BM` | `BOL900` | Midwest 204 profile convention for BOL |
| Purchase order | `L11.PO` | `PO111` | Midwest 204 profile convention for purchase order |
