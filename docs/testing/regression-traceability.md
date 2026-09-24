# Regression Traceability Matrix

| Requirement | Risk | Automated Test | Deployed Acceptance |
| --- | --- | --- | --- |
| Apex inbound authentication | Unauthorized load creation | `test_apex_ingestion_service.py`, failure matrix | Milestone 19 |
| Apex JSON parsing | Malformed body misclassified | `test_apex_ingestion_service.py`, failure matrix | Milestone 19 |
| Apex contract validation | Bad load accepted | Apex documented contract tests, ingestion tests | Milestone 19 |
| Apex duplicate handling | Duplicate business shipment silently accepted | Apex ingestion idempotency/duplicate tests | Milestone 19 |
| Canonical mapping | Business fields lost | Apex mapper tests, Apex -> canonical -> 204 chain | Milestone 18 |
| 204 generation | Invalid Midwest tender | 204 golden regression, X12 envelope validation | Milestone 18 |
| SFTP 204 delivery | Payload not atomically delivered/audited | Midwest direct dispatch and SFTP tests | Milestone 18 |
| 997 technical acknowledgment | 997 treated like 990 | 997 mapper/service tests | Milestone 18 |
| 990 business response | Tender decision not updated | 990 accepted/rejected tests | Milestone 18 |
| 214 shipment progression | Status event lost/mis-mapped | 214 mapper/service tests | Milestone 18 |
| Out-of-order 214 protection | Current status regresses | shipment progression and DB regression tests | Milestone 18 |
| Idempotency | Replay regenerates controls | Apex and 204 idempotency tests | Milestone 18 |
| Manual retry | Unsafe retry allowed | operations/direct dispatch retry tests | Manual operations flow |
| Mapping-version audit | Runtime profile unknown | mapping audit tests and config contract tests | Milestone 17/18 |
| Partner capability enforcement | Disabled flow still runs | Apex/Midwest capability tests | Milestone 17 |
| Operations API | Field rename breaks console | operations response contract tests | Milestone 16-19 |
| Failure Queue | Wrong filters hide failures | UI failure queue tests, Milestone 19 regression | Milestone 19 |
| Integration Lab happy path | Demo workflow breaks | Lab API/UI tests | Milestone 18 |
| Integration Lab failure drills | Controlled drills drift | failure drill catalog/classification tests | Milestone 19 |
| Secret/redaction protections | Credentials leak to API/UI output | health/config/lab/UI redaction tests | Milestone 16-19 |
| Database migrations | Fresh environment cannot boot | migration chain + schema/seed tests | Not run against Supabase |
| Analyst Console routes | Route removal breaks operators | frontend route contract test | Milestone 18/19 |
