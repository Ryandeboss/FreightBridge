# Database Schema

Milestone 4 introduces the FreightBridge domain schema. It is created by:

`infrastructure/supabase/migrations/20260920_001_create_freightbridge_domain.sql`

The schema uses PostgreSQL tables, constraints, indexes, and idempotent seed rows for synthetic trading partners. It does not store secrets or raw payload bodies.

## Entity Relationship Diagram

```mermaid
erDiagram
  trading_partners ||--o{ shipment_references : sources
  trading_partners ||--o{ tender_responses : carrier
  trading_partners ||--o{ shipment_events : source
  trading_partners ||--o{ integration_transactions : partner

  shipments ||--|{ shipment_stops : has
  shipments ||--o{ shipment_references : has
  shipments ||--o{ tender_responses : has
  shipments ||--o{ shipment_events : has

  integration_transactions ||--o{ tender_responses : source
  integration_transactions ||--o{ shipment_events : source
  integration_transactions ||--o{ processing_logs : logs
  integration_transactions ||--o{ integration_errors : errors
  integration_transactions ||--o{ integration_transactions : parent

  trading_partners {
    uuid id PK
    text partner_code UK
    text name
    text business_role
    text integration_style
    boolean active
    timestamptz created_at
    timestamptz updated_at
  }

  shipments {
    uuid id PK
    text shipment_number UK
    text equipment_type
    numeric weight_lbs
    integer pieces
    text commodity_description
    text tender_status
    text current_status
    timestamptz current_status_occurred_at
    timestamptz created_at
    timestamptz updated_at
  }

  shipment_stops {
    uuid id PK
    uuid shipment_id FK
    integer stop_sequence
    text stop_type
    text facility_name
    text address_line_1
    text address_line_2
    text city
    text state
    text postal_code
    timestamptz scheduled_at
  }

  shipment_references {
    uuid id PK
    uuid shipment_id FK
    text reference_type
    text reference_value
    uuid source_partner_id FK
    timestamptz created_at
  }

  tender_responses {
    uuid id PK
    uuid shipment_id FK
    uuid carrier_partner_id FK
    text decision
    text carrier_load_number
    text reason_code
    text message
    timestamptz decided_at
    timestamptz received_at
    uuid source_transaction_id FK
  }

  shipment_events {
    uuid id PK
    uuid shipment_id FK
    text status
    timestamptz occurred_at
    timestamptz received_at
    text city
    text state
    uuid source_partner_id FK
    uuid source_transaction_id FK
  }

  integration_transactions {
    uuid id PK
    text correlation_id
    uuid partner_id FK
    text direction
    text transport
    text message_format
    text document_type
    text business_identifier
    text x12_version
    text interchange_control_number
    text group_control_number
    text transaction_control_number
    text processing_status
    text processing_stage
    uuid parent_transaction_id FK
  }
```

## Major Constraints

- Known enum-like values are constrained with `CHECK` constraints.
- `shipment_number` and `partner_code` are unique.
- Shipment references prevent duplicate `(shipment_id, reference_type, reference_value)` rows.
- Stops require positive sequence numbers and known stop types.
- Tender rejections require a reason code.
- REST transactions must use JSON; SFTP transactions must use X12 for the MVP schema.

## Major Indexes

- `partner_code`
- `shipment_number`
- `shipments.current_status`
- shipment/event foreign keys
- `shipment_events.occurred_at`
- transaction `correlation_id`
- transaction `business_identifier`
- transaction processing status
- X12 control numbers for X12 transactions
- processing log and integration error transaction IDs

## Seed Data

The migration upserts two stable synthetic partners:

- `APEX` - Apex Logistics, `BROKER_3PL`, `REST_JSON`
- `MWCX` - Midwest Carrier, `MOTOR_CARRIER`, `X12_SFTP`

No LOAD500 business data is seeded permanently.
