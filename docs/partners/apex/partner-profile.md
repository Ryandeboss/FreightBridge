# Apex Logistics Partner Profile

Apex Logistics is a synthetic trading partner created for the FreightBridge portfolio lab. It does not represent a real company, system, contact, credential, or production integration.

## Company Summary

- Company name: Apex Logistics
- Fictional company identifier: `APEX`
- Business role: Freight broker / third-party logistics provider
- Integration style: Modern API-first TMS integration
- Source/target system: Apex TMS, a fictitious broker transportation management system
- Supported protocols: HTTPS REST API
- Supported formats: JSON
- MVP authentication: Bearer token issued out-of-band
- Expected availability: 24/7 API availability target with planned maintenance windows

## Message and Document Types

- Load tender submission
- Tender decision receipt
- Shipment status receipt
- Load lookup by Apex load ID

## Environments

| Environment | Purpose | Notes |
| --- | --- | --- |
| Sandbox | Development and contract testing | Synthetic data only |
| Staging | Pre-production validation | Future environment |
| Production | Live portfolio demo path | No real customer freight |

## Contacts

Business contacts are represented by fictional roles only:

- Broker operations owner
- Customer success representative
- Escalation coordinator

Technical contacts are represented by fictional roles only:

- API product owner
- Integration engineer
- Security approver

## Integration Responsibilities

Apex is responsible for:

- Producing valid Apex JSON load tenders.
- Receiving FreightBridge-delivered tender decisions and shipment statuses.
- Maintaining bearer-token access for FreightBridge.
- Providing stable API behavior within the versioned `/v1` contract.

FreightBridge is responsible for:

- Calling Apex APIs over HTTPS.
- Preserving Apex identifiers for later correlation.
- Translating future canonical data into Apex JSON responses.
- Avoiding exposure of Apex authentication tokens.

## Assumptions

- Apex models freight from a broker/TMS perspective, not as FreightBridge canonical data.
- Apex uses camelCase JSON fields.
- Apex expects one load per tender request for the MVP.
- Apex receives tender responses and shipment statuses through REST callbacks.

## Known Limitations

- OAuth, mTLS, webhooks, and event subscriptions are deferred.
- Apex APIs are contract-only in this milestone and are not implemented.
- Apex does not exchange X12 or SFTP files directly.
- Real customer, carrier, or contact data must never be used in fixtures.
