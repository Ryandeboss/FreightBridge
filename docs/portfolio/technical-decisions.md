# Technical Decisions

Each decision below is grounded in the implemented FreightBridge scope.

| Decision | Why | Tradeoff | Example |
| --- | --- | --- | --- |
| Model Apex as REST/JSON and Midwest as X12/SFTP | Shows both modern API integration and legacy EDI/file integration in one project. | More moving parts than a single-protocol demo. | Apex sends load JSON; Midwest receives X12 204 over SFTP. |
| Use a canonical model | Prevents direct Apex-to-Midwest coupling and gives FreightBridge stable business state. | Requires explicit mappings on both sides. | Apex `loadId` becomes canonical shipment number, then Midwest B2/L11/stop segments. |
| Target X12 004010 | Gives a concrete, testable EDI profile. | Does not claim broad X12 version support. | ISA12 `00401`, GS08 `004010`. |
| Separate generic parser from partner mapping | Keeps envelope parsing reusable and business rules explicit. | Partner-specific modules still need careful tests. | Parser reads segments; Midwest 214 mapping decides `AT7*X6` means `IN_TRANSIT`. |
| Treat 997 and 990 separately | Technical acknowledgment and business tender decision are different EDI concepts. | More transaction correlation to manage. | `997` records AK1/AK2 acknowledgment; `990` updates tender status. |
| Latest `occurredAt` wins current status | Shipment state should follow business event time, not message arrival order. | Requires preserving both event history and computed current status. | Late-arriving `ARRIVED` does not regress an already delivered load. |
| Append shipment events | Preserves audit history and avoids overwriting evidence. | Consumers need a current-status rule. | Both delivered and late arrived records remain visible. |
| Pin SFTP host keys | Avoids trusting an unexpected file endpoint. | Requires explicit configured fingerprints. | Host-key mismatch drill fails at the transport boundary. |
| Upload SFTP files atomically | Prevents a partner from reading partial EDI documents. | Requires temporary filenames and rename logic. | Upload `*.part`, then rename final. |
| Use idempotency records | Allows safe replay of the same logical request. | Reuse with a different request must fail. | Same idempotency key returns the original result; different fingerprint returns conflict. |
| Retry stored payloads | Avoids regenerating different control numbers on retry. | Requires retaining payload hash/text and retry relationships. | Outbound 204 retry uses the original ISA13/GS06/ST02. |
| Version mapping profiles | Makes runtime mapping behavior auditable. | Does not provide arbitrary drag-and-drop mapping. | Transactions store mapping key, id, and version. |
| Persist operations observability | Analysts need safe error and timeline context. | More tables and APIs than a black-box transformer. | IntegrationTransaction, ProcessingLog, IntegrationError, and business trace. |
| Include controlled failure drills | Demos become repeatable and diagnostic. | Drills must be constrained to known safe scenarios. | Unsupported 214 status produces expected mapping failure. |
| Use ephemeral PostgreSQL in CI | Proves migrations and real repositories work without touching Supabase. | Adds CI runtime cost. | CI applies migrations 001-011 to PostgreSQL 16 from scratch. |
