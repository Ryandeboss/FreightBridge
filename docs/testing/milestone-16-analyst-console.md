# Milestone 16 Analyst Console Acceptance

Milestone 16 adds the first real analyst-facing UI on top of the already accepted operations APIs. It does not add database migrations or new backend contracts.

## Local Verification

Frontend checks:

```bash
cd apps/analyst-ui
npm run lint
npm run test
npm run build
```

Backend and harness regression checks remain:

```bash
cd services/freightbridge-api
python -m pytest

cd ../apex-partner-sim
python -m pytest

cd ../midwest-partner-sim
python -m pytest

cd ../../
python -m pytest scripts/acceptance/tests
```

## Deployed Acceptance

The deployed acceptance script creates live data before opening the browser:

1. Create a fresh Apex load.
2. Dispatch the load to FreightBridge.
3. Dispatch the same load without an idempotency key to create a safe duplicate failure.
4. Dispatch the original Midwest 204 through the existing SFTP route.
5. Open the deployed Analyst UI.
6. Enter the operations token in the browser.
7. Verify dashboard, transaction search/detail, failures, business trace, and lock behavior.

Run locally with:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
python -m playwright install chromium
python scripts/acceptance/milestone16.py
```

Required environment variables are the same deployed service variables as earlier milestones, plus:

```text
OPERATIONS_API_BEARER_TOKEN
ANALYST_UI_BASE_URL
```

In GitHub Actions, `ANALYST_UI_BASE_URL` is a repository Actions variable, not a secret. The operations token remains a secret and is typed into the browser session by Playwright. The script does not capture screenshots or print the token.

## Scope Exclusions

Milestone 16 intentionally does not include:

- partner configuration editing
- mapping editing
- Integration Lab
- failure injection
- raw payload editing or raw payload body viewing
- Supabase Auth, OAuth, or JWT login
- automatic polling or websocket updates
