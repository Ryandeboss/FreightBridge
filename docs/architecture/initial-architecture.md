# Initial Architecture

This diagram captures the current FreightBridge direction. Apex is now implemented as an independent REST/JSON simulator, while the Apex-to-FreightBridge connection, mapping, EDI, SFTP, and Midwest simulator behavior remain future work.

```mermaid
flowchart TD
  Apex[Apex Partner Simulator - implemented] -. REST/JSON not connected .-> API[FreightBridge API]
  UI[Analyst UI] --> API
  API -->|Canonical Model - foundation implemented| Pipeline[FreightBridge processing pipeline]
  Pipeline -. future X12/SFTP .-> Midwest[Midwest Carrier - contract only]
  API --> Supabase[(Supabase PostgreSQL)]
  Apex --> ApexSchema[(Supabase PostgreSQL apex_sim schema)]
  SFTP[SFTPGo on Railway - reserved] -. later SFTP milestone .-> Pipeline
```

## Component Notes

- Apex Partner Simulator: independent synthetic REST/JSON partner backend.
- Analyst UI: React/Vite operational dashboard deployed to Vercel.
- FreightBridge API: FastAPI middleware deployed to Render.
- Supabase PostgreSQL: durable FreightBridge canonical records and, for portfolio cost simplicity, the separate `apex_sim` logical partner schema.
- SFTPGo on Railway: provisioned / reserved for a later public SFTP ingress milestone.
- Midwest Carrier Simulator: future synthetic X12/SFTP destination.
