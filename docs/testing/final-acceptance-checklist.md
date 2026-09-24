# Final Acceptance Checklist

This is the human-readable checklist that mirrors Milestone 22.

## Before Running

- Confirm normal CI is green on `main`.
- Confirm deployed services are expected to point at the synthetic MVP environment.
- Confirm GitHub Actions secrets/variables exist for the deployed acceptance workflow.
- Confirm no direct `DATABASE_URL` verification is required for Milestone 22.

## Run

From GitHub Actions:

```text
Workflow: Deployed Acceptance
milestone: milestone22
```

Local equivalent:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python -m playwright install chromium
python scripts/acceptance/milestone22.py
```

## Pass Criteria

- Apex, FreightBridge, and Midwest health/readiness checks pass.
- FreightBridge and Midwest SFTP readiness checks pass.
- Operations summary returns stable numeric/object fields.
- APEX and MWCX configuration records and capabilities are readable.
- Required active mapping profiles are present.
- Integration Lab readiness includes the full lifecycle scenario and current failure drills.
- Analyst UI unlocks and shows the primary operations navigation.
- Milestone 20 child regression succeeds.
- Postflight readiness checks still pass.

## Evidence To Keep

- GitHub Actions run ID.
- Final commit SHA.
- Synthetic load ID or generated child load prefixes, if supplied.
- Summary of normal CI and deployed acceptance status.

## Non-Goals

- Do not use real trading partner or customer data.
- Do not add migration `012`.
- Do not change production configuration or secrets.
- Do not implement `210`, AS2/MDN, SOAP/XML third partner behavior, `999`, or `TA1`.



## Acceptance Record

Fill this section only after the final deployed acceptance has completed.

| Field | Value |
| --- | --- |
| Final commit SHA | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Normal CI run ID | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Normal CI conclusion | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Milestone 22 deployed run ID | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Milestone 22 conclusion | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Accepted date | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Accepted load/run identifiers | TO BE RECORDED AFTER FINAL ACCEPTANCE |
| Migrations through | `011` |
| Supported X12 transactions | `204`, `997`, `990`, `214` |
| Deferred Phase 2 | `210`, AS2/MDN, SOAP/XML third partner, `999`, TA1 |