# Midwest 997 Functional Acknowledgment Mapping

Milestone 13 implements a deliberately constrained Midwest X12 004010 `997` profile.

The 997 is a technical or functional acknowledgment. It says Midwest received and evaluated the EDI structure of the original 204. It does not accept or reject the freight tender. The business tender answer remains the 990.

TA1 is not implemented in this milestone. TA1 is an interchange acknowledgment concept, while this project 997 acknowledges the functional group and transaction set level.

## Direction

```text
Midwest
  -> X12 997 over SFTP /outbound
FreightBridge
  -> parse/map/correlate
  -> functional_acknowledgments audit
```

## Profile

Envelope:

- ISA sender: `MWCX`
- ISA receiver: `FREIGHTBRIDGE`
- ISA12: `00401`
- GS01: `FA`
- GS08: `004010`
- ST01: `997`

Required segments:

- `ISA`
- `GS`
- `ST`
- `AK1`
- `AK2`
- `AK5`
- `AK9`
- `SE`
- `GE`
- `IEA`

## AK1 Mapping

| Element | Meaning |
| --- | --- |
| AK1-01 | Original functional identifier. Required: `SM` for the acknowledged 204 group. |
| AK1-02 | Original 204 GS06 functional group control number. |

## AK2 Mapping

| Element | Meaning |
| --- | --- |
| AK2-01 | Original transaction set identifier. Required: `204`. |
| AK2-02 | Original 204 ST02 transaction control number. |

FreightBridge correlates the 997 to the original outbound 204 using Midwest partner, outbound direction, X12 format, document type `204`, AK1-02 as original GS06, and AK2-02 as original ST02. It does not correlate by filename or require the shipment number inside the 997.

## AK5 / AK9 Subset

Supported project codes:

| AK5 | AK9 | Status |
| --- | --- | --- |
| `A` | `A` | `ACCEPTED` |
| `R` | `R` | `REJECTED` |

Accepted profile:

```text
AK5*A~
AK9*A*1*1*1~
```

Rejected profile:

```text
AK5*R~
AK9*R*1*1*0~
```

Mixed `A/R` combinations and inconsistent AK9 counts are rejected by the project profile.

## Business-State Rule

Processing a 997 never updates:

- `shipments.tender_status`
- `shipments.current_status`
- `tender_responses`
- `shipment_events`
- Apex tender decision
- Apex shipment status

A shipment can be technically acknowledged by 997 while its tender remains `PENDING`. Only the 990 business tender response changes tender status.
