# Initial Architecture

This diagram captures the current FreightBridge direction. Apex now dispatches REST/JSON load tenders into FreightBridge, where they are authenticated, audited, mapped, and persisted as canonical shipments. EDI, SFTP, and Midwest simulator behavior remain future work.

```mermaid
flowchart TD
  Apex[Apex Partner Simulator - implemented] -->|HTTPS JSON + bearer| Ingest[FreightBridge REST Ingestion]
  Ingest --> Tx[IntegrationTransaction]
  Ingest --> Logs[ProcessingLogs and IntegrationErrors]
  Ingest --> Mapper[Apex Mapper]
  Mapper --> Canonical[CanonicalShipment]
  Canonical --> API[FreightBridge API]
  UI[Analyst UI] --> API
  API -->|Canonical Model - foundation implemented| Pipeline[FreightBridge processing pipeline]
  Pipeline -. future X12/SFTP .-> Midwest[Midwest Carrier - contract only]
  API --> Supabase[(Supabase PostgreSQL)]
  Apex --> ApexSchema[(Supabase PostgreSQL apex_sim schema)]
  SFTP[SFTPGo on Railway - reserved] -. later SFTP milestone .-> Pipeline
```

## Component Notes

- Apex Partner Simulator: independent synthetic REST/JSON partner backend that can dispatch loads to FreightBridge.
- Analyst UI: React/Vite operational dashboard deployed to Vercel.
- FreightBridge API: FastAPI middleware deployed to Render, including Apex REST ingestion and canonical persistence.
- Supabase PostgreSQL: durable FreightBridge canonical records and, for portfolio cost simplicity, the separate `apex_sim` logical partner schema.
- SFTPGo on Railway: provisioned / reserved for a later public SFTP ingress milestone.
- Midwest Carrier Simulator: future synthetic X12/SFTP destination.
