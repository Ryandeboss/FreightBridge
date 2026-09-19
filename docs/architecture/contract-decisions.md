# Contract Decision Log

These decisions apply to Milestone 3 contract design only. They do not implement the canonical model, mappings, EDI parser, SFTP exchange, simulators, or persistence.

## Apex Uses REST/JSON

Decision: Apex Logistics is modeled as a modern broker/3PL with HTTPS REST and JSON.

Reason: This gives FreightBridge a contemporary API-side partner that differs from the EDI carrier side.

Consequence: Apex field names and object shapes are independent from Midwest and from the future FreightBridge canonical model.

## Midwest Uses X12/SFTP

Decision: Midwest Carrier is modeled as a legacy-style carrier using X12 files over future SFTP.

Reason: This creates a realistic integration contrast for a logistics middleware portfolio project.

Consequence: Future FreightBridge work must handle asynchronous file exchange, control numbers, acknowledgments, and partner-specific EDI assumptions.

## X12 004010 Is Used for MVP

Decision: Midwest uses X12 version 004010 / 4010 for the initial profile.

Reason: 4010 is a recognizable legacy EDI version for logistics examples.

Consequence: The implementation guide and fixtures constrain the MVP to a small project-specific subset rather than a complete X12 guide.

## 204 and 990 Come Before 214 and 997 Processing

Decision: The primary future flow starts with 204 tender and 990 response, with 997 acknowledgment and 214 status included in the MVP profile.

Reason: Tender lifecycle proves the core broker-to-carrier integration before broader operational events.

Consequence: 214/997 are documented now, but code can be phased later without changing the partner contract vocabulary.

## 210 Is Deferred

Decision: 210 Freight Invoice is future/stretch only.

Reason: Invoicing adds billing complexity that should follow tender/status integration.

Consequence: Documents may mention 210 only as FUTURE and must not imply MVP implementation.

## Partner Models Stay Independent

Decision: Apex and Midwest models are defined independently.

Reason: Real integrations rarely share a canonical data model across organizations.

Consequence: Future FreightBridge canonical design must be derived from both partner contracts rather than copied from either side.

## Canonical Mapping Is Not Defined Yet

Decision: This milestone avoids canonical mapping rules.

Reason: The next milestone should design FreightBridge's canonical representation using these endpoint contracts as input.

Consequence: Documents describe partner-side concepts and planned flow, not direct Apex-to-Midwest field mapping.

## SFTP Is Documented but Not Activated

Decision: Midwest SFTP directory and naming conventions are specified conceptually, but Railway/SFTPGo remains untouched.

Reason: Connectivity activation should happen after contract review and before parser/exchange implementation.

Consequence: No SFTP client, server configuration, credentials, keys, or Railway changes are included.

## AS2 Is Deferred

Decision: AS2 is not part of the MVP contract.

Reason: SFTP is simpler for a portfolio lab and already aligns with the provisioned Railway/SFTPGo direction.

Consequence: AS2 can be reconsidered later without blocking the MVP tender/status flow.
