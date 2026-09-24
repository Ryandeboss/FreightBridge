# Resume Materials

## Concise Resume Bullets

- Built FreightBridge, a portfolio logistics integration lab connecting synthetic REST/JSON and X12/SFTP trading partner workflows.
- Implemented end-to-end shipment lifecycle processing with canonical mapping, acknowledgments, status updates, and analyst-facing troubleshooting tools.
- Hardened integration quality with contract tests, X12 regression fixtures, frontend coverage, and PostgreSQL migration validation in GitHub Actions.

## Technical Resume Bullets

- Developed Python/FastAPI services that translate Apex REST/JSON load tenders into canonical shipments and Midwest X12 004010 `204` load tenders over SFTP.
- Implemented inbound X12 `997`, `990`, and `214` processing with functional acknowledgment correlation, tender-decision updates, shipment-event history, and out-of-order status protection.
- Built a React/TypeScript Analyst Console backed by PostgreSQL audit data for transaction timelines, failure queue diagnosis, business trace, mapping/version visibility, and Integration Lab runs.

## Short Project Description

FreightBridge is a portfolio integration project that models a logistics middleware layer between two fictional trading partners: Apex Logistics and Midwest Carrier. It demonstrates REST/JSON ingestion, canonical shipment mapping, X12 004010 processing, SFTP exchange, observability, failure diagnosis, and regression testing without using real customer or partner data.

## LinkedIn / Portfolio Description

FreightBridge is a synthetic logistics integration lab built to demonstrate realistic EDI/API integration work without claiming production TMS status or using real trading partners. The project connects fictional Apex Logistics over REST/JSON to fictional Midwest Carrier over X12 004010 and SFTP, using a FreightBridge middleware layer for canonical mapping, 204 load tenders, 997 technical acknowledgments, 990 tender responses, 214 shipment status events, idempotency, retry, observability, and analyst troubleshooting. The strongest technical lessons are around keeping generic X12 parsing separate from partner-specific business mapping, treating 997 and 990 as distinct technical vs business events, preserving auditability through transaction/log/error records, and testing integration correctness across unit, contract, UI, deployed acceptance, and ephemeral PostgreSQL migration boundaries. Deferred scope includes 210 freight invoice, AS2, MDN, SOAP/XML third partner, 999, and TA1.
