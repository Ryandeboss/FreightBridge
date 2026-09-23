# Midwest Carrier Partner Profile

Midwest Carrier is a synthetic trading partner created for the FreightBridge portfolio lab. It does not represent a real company, system, contact, credential, route, carrier, or production integration.

## Company Summary

- Company name: Midwest Carrier
- Fictional company identifier: `MWCX`
- Business role: Motor carrier
- Integration style: Legacy-style EDI gateway connected to an older carrier TMS
- Source/target system: Midwest Dispatch TMS and EDI gateway, both fictitious
- Supported protocols: Railway/SFTPGo SFTP plus temporary REST test harness endpoints
- Supported formats: X12 EDI, version 004010 / 4010 for MVP
- Authentication: SSH key authentication through Railway-hosted SFTPGo for SFTP; bearer tokens for temporary REST harness endpoints
- Expected availability: Daily operating coverage with unattended EDI file exchange

## Message and Document Types

MVP transaction sets:

- 204 - Motor Carrier Load Tender
- 990 - Response to Load Tender
- 214 - Shipment Status
- 997 - Functional Acknowledgment

Future / stretch:

- 210 - Freight Invoice

## Environments

| Environment | Purpose | Notes |
| --- | --- | --- |
| Sandbox | Synthetic file exchange testing | Railway/SFTPGo setup |
| Staging | Pre-production validation | Future environment |
| Production | Portfolio demo path | No real freight or credentials |

## Contacts

Business contacts are represented by fictional roles only:

- Carrier operations manager
- Dispatch lead
- Billing coordinator

Technical contacts are represented by fictional roles only:

- EDI coordinator
- TMS support analyst
- SFTP administrator

## Integration Responsibilities

Midwest is responsible for:

- Receiving X12 204 load tenders through its inbound SFTP directory.
- Returning 997 acknowledgments for technical EDI receipt.
- Returning 990 tender decisions and 214 shipment statuses through SFTP outbound files.
- Maintaining partner-specific EDI conventions documented for FreightBridge.

FreightBridge is responsible for:

- Generating and dispatching Midwest-specific X12 204 files from the canonical model.
- Picking up Midwest outbound 990 and 214 EDI files.
- Preserving control numbers and business identifiers for correlation.
- Keeping SFTP credentials and SSH keys out of source control.

## Assumptions

- Midwest exposes REST APIs only as simulator controls and temporary test harness endpoints.
- Midwest represents freight using carrier/TMS concepts that differ from Apex JSON.
- X12 4010 is used to mimic a legacy-style EDI integration.
- SFTP connectivity is active in the portfolio demo path.

## Known Limitations

- The EDI profile is deliberately constrained for FreightBridge and is not a complete ANSI X12 implementation guide.
- 210 freight invoice is explicitly future/stretch and is not part of the MVP implementation contract.
- 210 freight invoice remains deferred.
