# Interview Guide

## 30-Second Pitch

FreightBridge is a synthetic logistics integration platform that connects a REST/JSON broker simulator to an X12/SFTP carrier simulator. It maps partner-specific messages into a canonical shipment model, generates and processes 204, 997, 990, and 214 EDI flows, and gives analysts transaction timelines, failure diagnosis, and an Integration Lab. The project is built to show integration engineering judgment: protocol boundaries, idempotency, retry, mapping versioning, observability, and regression testing.

## Two-Minute Explanation

FreightBridge starts with Apex Logistics, a fictional broker/3PL that sends load tenders as JSON over REST. FreightBridge authenticates the request, validates the Apex contract, maps it into a canonical shipment, persists audit records, and generates a Midwest Carrier X12 204 load tender. That 204 is delivered through SFTP using atomic upload and rename.

Midwest then returns X12 documents. A 997 confirms technical receipt of the 204, but it does not accept the freight. A 990 is the business tender response, accepted or rejected, and FreightBridge forwards that state back to Apex. Midwest also sends 214 shipment-status files, which FreightBridge maps to canonical events and forwards to Apex. Current shipment status is based on the latest business occurred time, so a late-arriving older event does not regress a delivered shipment.

The Analyst Console exposes transaction search, failure queue, business trace, mapping configuration, and an Integration Lab. The Lab can run the happy path or controlled failure drills, such as unsupported 214 status or invalid Apex JSON. Normal CI protects the project with contract tests, X12 regression tests, frontend tests, coverage gates, and a real PostgreSQL migration-chain job.

## Common Questions

### Tell me about FreightBridge.

It is a portfolio integration lab for realistic EDI/API logistics problems. It shows how to bridge REST/JSON and X12/SFTP while keeping mapping, transport, observability, retry, and testing explicit.

### Why did you build it?

To demonstrate the parts of integration work that are hard to show in a small CRUD app: protocol mismatch, partner-specific contracts, control numbers, idempotency, SFTP file safety, acknowledgments, out-of-order events, and support tooling.

### Why use a canonical model?

The canonical model prevents Apex JSON from being directly coupled to Midwest X12. Apex can have JSON-friendly field names, Midwest can have X12 segment semantics, and FreightBridge can hold stable business state between them.

### What is the difference between a 997 and a 990?

A 997 is a technical functional acknowledgment. It says the EDI document was received and structurally acknowledged. A 990 is the business tender response. It accepts or rejects the load. FreightBridge records them separately.

### How does SFTP fit into the design?

SFTP models the carrier file boundary. FreightBridge uploads outbound files atomically, pins host keys, polls inbound files, archives successful files, moves failed files to error paths, and records transport metadata.

### How do you prevent duplicate processing?

FreightBridge treats business duplicate detection and idempotency-key replay separately. A duplicate business request without an idempotency key can fail appropriately. A repeated request with the same valid idempotency key can replay the original result safely.

### How do retries work?

Manual retry is constrained to supported failed outbound cases. Retry uses the stored original payload so X12 control numbers and payload hashes do not silently change.

### How do you handle out-of-order shipment statuses?

Events are appended to history, but current status is computed from latest `occurredAt`, not latest received time. A late-arriving `ARRIVED` event will not regress a `DELIVERED` shipment if it occurred earlier.

### How would you troubleshoot a failed 214?

I would inspect the Failure Detail and Transaction Detail. If parsing and envelope validation passed but the error is `UNSUPPORTED_AT7_CODE` at the mapping stage, the X12 structure was valid but the Midwest profile did not support that business status code.

### How do mappings change safely?

Mapping profiles are explicit and versioned. Drafts can be validated and activated, while runtime transactions store mapping key, profile id, and version for audit.

### How do you know the system still works after a change?

CI runs unit, contract, X12, frontend, acceptance-harness, documentation, coverage, and real PostgreSQL migration tests. Deployed regression is manual and runs the happy path plus failure drills against live synthetic services.

### What would you build next?

Likely a 210 freight invoice, a SOAP/XML third partner, AS2 with MDN, and deeper promotion/change-management workflow for partner configuration.
