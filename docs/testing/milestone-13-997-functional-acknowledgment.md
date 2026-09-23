# Milestone 13 997 Functional Acknowledgment Acceptance

Milestone 13 adds a constrained X12 997 Functional Acknowledgment flow for Midwest Carrier.

## Core Lesson

```text
204 = freight tender sent
997 = technical EDI acknowledgment
990 = business tender decision
```

A successful 997 does not mean Midwest accepted the load. The load remains `PENDING` until a 990 tender response is processed.

## Scope

- Midwest generates a stored A/A 997 after successfully receiving and validating a 204.
- Midwest dispatches the stored 997 to SFTP `/outbound` only when explicitly requested.
- FreightBridge routes ST01 `997` from the existing outbound SFTP poller.
- FreightBridge validates and maps the project 997 profile.
- FreightBridge correlates the 997 to the original outbound 204 using AK1/AK2 controls.
- FreightBridge persists technical acknowledgment audit in `public.functional_acknowledgments`.
- FreightBridge appends an ACKNOWLEDGMENT processing log to the original outbound 204.

Out of scope:

- TA1
- 999
- AS2 / MDN
- 210
- Analyst UI
- background polling
- general retry engine

## Migration

Apply:

```text
infrastructure/supabase/migrations/20260923_007_add_functional_acknowledgments.sql
```

This migration:

- Adds `midwest_sim.outbound_edi_documents.inbound_document_id`.
- Updates the Midwest outbound source check to allow:
  - `990` linked to `tender_decision_id`
  - `214` linked to `shipment_event_id`
  - `997` linked to `inbound_document_id`
- Creates `public.functional_acknowledgments`.
- Adds indexes for 997 lookup and correlation.

## Automated Deployed Acceptance

After migration 007 is applied and services redeploy, run:

```text
GitHub Actions -> Deployed Acceptance -> Run workflow
milestone = milestone13
```

Optional:

- provide `load_id`
- enable `run_db_verification`
- enable `verbose`

Local command:

```bash
python scripts/acceptance/milestone13.py
```

## Automated Flow

```text
Apex creates load
  -> Apex dispatches to FreightBridge
  -> FreightBridge sends X12 204 to SFTP /inbound
  -> Midwest polls /inbound
  -> Midwest creates load as PENDING
  -> Midwest creates stored X12 997 A/A
  -> Midwest dispatches 997 to SFTP /outbound
  -> FreightBridge polls /outbound
  -> FreightBridge persists functional acknowledgment
  -> Tender remains PENDING
  -> Midwest later accepts tender
  -> Midwest sends 990
  -> FreightBridge processes 990
  -> Apex currentTenderDecision becomes ACCEPTED
```

## Manual Debug Endpoints

Midwest:

```http
GET /v1/loads/{customer_shipment_number}/functional-acknowledgments
POST /v1/functional-acknowledgments/{outbound_document_id}/dispatch-sftp
```

FreightBridge:

```http
GET /api/integrations/midwest/load-tenders/{shipment_number}/functional-acknowledgment
POST /api/integrations/midwest/sftp/outbound/poll
```

## Expected 997

Accepted:

```text
ST*997*0001~
AK1*SM*<original-204-GS06>~
AK2*204*<original-204-ST02>~
AK5*A~
AK9*A*1*1*1~
SE*6*0001~
```

Rejected fixture:

```text
AK5*R~
AK9*R*1*1*0~
```

Rejected 997 processing is successful processing of the 997 document itself. The original 204 receives a failed ACKNOWLEDGMENT log and optional `997_REJECTED` integration error, but shipment tender status is not changed.
