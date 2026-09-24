# Integration Lab

The Integration Lab is an analyst-facing workbench for exercising implemented FreightBridge paths against the deployed partner simulators. It creates controlled synthetic runs, executes one integration step at a time, and records durable run/step state in `integration_lab_runs` and `integration_lab_steps`.

Supported scenarios:

- `TECHNICAL_ACK_ONLY`: Apex load tender, Midwest 204 over SFTP, Midwest 997 technical acknowledgment.
- `TENDER_ACCEPTED`: technical acknowledgment plus accepted Midwest 990 business response.
- `TENDER_REJECTED`: technical acknowledgment plus rejected Midwest 990 business response.
- `FULL_SHIPMENT_LIFECYCLE`: accepted tender plus 214 events for `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, and `DELIVERED`.

The browser only calls `/api/lab` with `OPERATIONS_API_BEARER_TOKEN`. Partner simulator bearer tokens, inbound tokens, SFTP credentials, database URLs, and Supabase secrets remain server-side configuration.

Operational behavior:

- Creating a run is side-effect free. Steps are created as `PENDING`.
- `Run Step` executes exactly that eligible step.
- `Run Next Step` executes exactly one next eligible step.
- `Run All Remaining` loops through the same one-step API until completion or failure.
- Completed steps are idempotent readbacks and do not repeat side effects.
- Failed steps can be retried and preserve safe error codes/messages.

The run detail links back to Business Trace and Transactions so analysts can inspect the real audit trail produced by the scenario.
