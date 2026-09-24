# Milestone 17 Partner And Mapping Configuration

Milestone 17 verifies trading partner configuration, versioned mapping profiles, runtime profile consumption, and Analyst Console configuration screens.

## Local Verification

```bash
cd services/freightbridge-api
python -m pytest

cd ../apex-partner-sim
python -m pytest

cd ../midwest-partner-sim
python -m pytest

cd ../../apps/analyst-ui
npm run lint
npm test -- --run
npm run build
```

## Deployed Acceptance

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python -m playwright install chromium
python scripts/acceptance/milestone17.py
```

Required deployed environment variables:

- `APEX_BASE_URL`
- `APEX_BEARER_TOKEN`
- `FREIGHTBRIDGE_BASE_URL`
- `MIDWEST_BASE_URL`
- `MIDWEST_BEARER_TOKEN`
- `OPERATIONS_API_BEARER_TOKEN`
- `ANALYST_UI_BASE_URL`

The deployed script checks partner/configuration APIs, clones and abandons a draft profile, creates a live Apex load, verifies mapping audit fields on the resulting operations transaction, and exercises Partners/Mappings screens in the Analyst Console.
