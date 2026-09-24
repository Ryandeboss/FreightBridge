# Milestone 18 Integration Lab Acceptance

Milestone 18 adds the Analyst Console Integration Lab.

Acceptance focus:

- Create a `FULL_SHIPMENT_LIFECYCLE` run through the deployed UI.
- Execute the first step manually.
- Use `Run All Remaining` to complete the run.
- Verify all steps succeed.
- Verify the 204 preview includes ISA13, GS06, ST02, mapping version, and SFTP filename.
- Verify the UI distinguishes the 997 technical acknowledgment from the 990 business response.
- Verify final tender status is `ACCEPTED`.
- Verify final shipment status is `DELIVERED`.
- Verify 214 progression includes `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, and `DELIVERED`.
- Verify Business Trace includes `APEX_LOAD_TENDER`, `204`, `997`, `990`, and `214`.

Run locally against deployed services:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python -m playwright install chromium
python scripts/acceptance/milestone18.py
```

Required for this milestone:

- `FREIGHTBRIDGE_BASE_URL`
- `ANALYST_UI_BASE_URL`
- `OPERATIONS_API_BEARER_TOKEN`

The shared acceptance config also expects the existing partner simulator URL/token variables. No new secrets or environment variables are introduced by Milestone 18.
