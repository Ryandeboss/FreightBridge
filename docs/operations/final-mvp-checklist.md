# Final MVP Checklist

Use this checklist before presenting FreightBridge as a completed MVP portfolio lab.

## Deployment

- Analyst UI is reachable at the configured Vercel URL.
- FreightBridge API `/health` and `/readiness` return healthy responses.
- Apex Partner Simulator `/health` and `/readiness` return healthy responses.
- Midwest Partner Simulator `/health` and `/readiness` return healthy responses.
- Supabase migrations `001` through `011` are applied in the deployed database.
- Railway SFTPGo is reachable through both FreightBridge and Midwest SFTP readiness endpoints.
- No frontend configuration exposes partner bearer tokens, SFTP credentials, database URLs, private keys, or Supabase secrets.

## Operations Surface

- Operations summary is readable with `OPERATIONS_API_BEARER_TOKEN`.
- Transaction search/detail, failure queue/detail, and business trace pages are available in the Analyst Console.
- Partner detail pages show APEX and MWCX metadata and capabilities.
- Mapping pages show the active APEX and MWCX mapping profiles.
- Integration Lab readiness shows `FULL_SHIPMENT_LIFECYCLE` and the controlled failure drills.

## Acceptance

- Normal CI is green.
- Deployed acceptance Milestone 20 is green or can be rerun from Milestone 22.
- Deployed acceptance Milestone 22 preflight, Milestone 20 child run, and postflight are green.
- Final acceptance evidence uses synthetic load IDs only.
- No real trading partner, customer, or production freight data is used.

## Boundaries

- FreightBridge remains a portfolio lab, not a production TMS.
- Apex Logistics and Midwest Carrier remain fictional/synthetic trading partners.
- Implemented X12 transaction sets are `204`, `997`, `990`, and `214`.
- Phase 2 items remain deferred: `210`, AS2/MDN, SOAP/XML third partner, `999`, `TA1`, broad mapping-designer workflow, and production promotion controls.
