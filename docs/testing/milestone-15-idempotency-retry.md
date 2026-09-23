# Milestone 15 Acceptance

Milestone 15 validates duplicate detection, idempotency, safe X12 replay, SFTP archive safety, and manual retry guardrails.

Run local deterministic checks:

```bash
cd services/freightbridge-api
python -m pytest

cd ../apex-partner-sim
python -m pytest

cd ../midwest-partner-sim
python -m pytest

cd ../../scripts/acceptance
python -m pytest

cd ../../apps/analyst-ui
npm run lint
npm run build
```

Run deployed acceptance after migration 009 and deployment:

```bash
python scripts/acceptance/milestone15.py --verbose
```

GitHub Actions:

1. Open Actions -> Deployed Acceptance.
2. Run workflow.
3. Choose `milestone15`.
4. Leave `load_id` blank.
5. Set `verbose=true`.
6. Run.

Expected final line:

```text
RESULT: PASS
```

No new secrets are required beyond the existing Apex, FreightBridge, Midwest, and Operations bearer tokens.
