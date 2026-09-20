# Midwest Carrier EDI Implementation Guide

This is a deliberately constrained synthetic EDI implementation profile for Midwest Carrier in the FreightBridge portfolio lab. It is not a complete ANSI X12 implementation guide.

Where details are simplified or uncertain, they are documented as FreightBridge project assumptions rather than universal X12 rules.

## General Profile

- X12 version: `004010`
- Supported MVP transaction sets: `204`, `990`, `214`, `997`
- Future / stretch transaction: `210` freight invoice
- Transport: future SFTP
- Segment terminator: `~`
- Element separator: `*`
- Component separator: `:`
- Repetition separator: not used in project fixtures
- Character set: printable ASCII for fixtures

## Envelope Conventions

Project fixtures use:

- ISA / IEA for interchange envelope
- GS / GE for functional group envelope
- ST / SE for transaction envelope

Control numbers in fixtures are synthetic and deterministic enough for contract review. Future implementation must generate unique control numbers per outbound interchange.

## 204 Motor Carrier Load Tender

Purpose: FreightBridge will eventually send Midwest a load tender as X12 204 after receiving an Apex JSON load.

Direction: FreightBridge -> Midwest.

Required project subset:

| Segment | Purpose | Required | Project notes |
| --- | --- | --- | --- |
| ISA | Interchange header | Required | Synthetic sender `FREIGHTBRIDGE`, receiver `MWCX` |
| GS | Functional group header | Required | Functional ID `SM` |
| ST | Transaction header | Required | Transaction set `204` |
| B2 | Beginning segment | Required | `B2-02` is Midwest carrier code / synthetic SCAC `MWCX`; `B2-04` is shipment/load identifier; `B2-06` is payment method |
| L11 | Reference numbers | Required for BOL and PO | `L11-01` is reference value; `L11-02` is reference qualifier |
| G62 | Dates/times | Required for demo pickup/delivery appointments | Project uses qualifier assumptions for appointment timing |
| N1 | Party identification | Required for shipper and consignee | `N1-01 = SH` for shipper, `N1-01 = CN` for consignee |
| N3 | Street address | Required under SH and CN loops | Address line 1 only in MVP fixture |
| N4 | City/state/postal | Required under SH and CN loops | Origin and destination city/state/postal |
| S5 | Stop-off details | Required for demo | Project uses stop sequence to separate pickup and delivery |
| L3 | Shipment weight | Required | Total weight in pounds |
| SE | Transaction trailer | Required | Segment count and control number |
| GE | Functional group trailer | Required | Group control number |
| IEA | Interchange trailer | Required | Interchange control number |

Preserved project conventions:

- `B2-02` -> Midwest carrier code / synthetic SCAC, `MWCX`
- `B2-04` -> shipper/broker shipment identifier, `LOAD500`
- `B2-06` -> payment method used by the fixture, `PP`
- `N1-02` where `N1-01 = SH` -> shipper name
- `N1-02` where `N1-01 = CN` -> consignee name
- `N4` under SH loop -> origin location
- `N4` under CN loop -> destination location
- `L11*BOL900*BM` -> Bill of Lading, where `BM` is the synthetic Midwest BOL qualifier
- `L11*PO111*PO` -> Purchase Order, where `PO` is the synthetic Midwest PO qualifier

This Midwest FreightBridge 204 profile uses L11 for these references. This does not claim that REF is never valid in other X12 profiles.

Business rules:

- One shipment/load per 204 fixture.
- BOL is required for MVP.
- PO is optional in general but present in the LOAD500 fixture.
- Missing consignee information is invalid for the MVP 204 profile.

## 990 Response to Load Tender

Purpose: Midwest returns a business-level tender decision.

Direction: Midwest -> FreightBridge.

Project subset:

- ST / B1 / L11 / SE inside X12 envelopes.
- Accepted fixture uses a partner-specific accepted code.
- Rejected fixture includes a project-level decline reason reference.

Business rule:

- 990 is the business answer to a 204 tender. It is distinct from 997 technical acknowledgment.

## 214 Shipment Status

Purpose: Midwest sends status events after tender acceptance.

Direction: Midwest -> FreightBridge.

Partner-specific status translation agreement:

| AT7-01 code | X12-facing event meaning in this Midwest profile | FreightBridge internal normalization for later work |
| --- | --- | --- |
| `AF` | Carrier departed pickup location with shipment | `PICKED_UP` |
| `X6` | En route to delivery location | `IN_TRANSIT` |
| `X1` | Arrived at delivery location | `ARRIVED` |
| `D1` | Completed unloading at delivery location | `DELIVERED` |

The X12 codes retain their X12-facing meanings. FreightBridge's names are internal normalization labels for future code. This Midwest implementation guide defines only the supported subset for this partner profile.

Project subset:

- B10 carries shipment/load correlation.
- L11 repeats BOL and PO references when available.
- AT7 carries status code and event date/time.
- MS1 carries event city/state.

## 997 Functional Acknowledgment

Purpose: Midwest acknowledges technical receipt and syntax validation of an EDI transaction.

Direction: Midwest -> FreightBridge for received 204 files. FreightBridge may later generate 997s for Midwest inbound files.

The 997 is a technical EDI acknowledgment and is distinct from the 990 business-level tender response.

Project subset:

- AK1 identifies the functional group being acknowledged.
- AK2 identifies the transaction set and control number.
- AK5 reports transaction acknowledgment status.
- AK9 reports group acknowledgment status.

## Future 210 Freight Invoice

210 Freight Invoice is future/stretch only. It is not part of the MVP implementation contract and must not be treated as implemented.
