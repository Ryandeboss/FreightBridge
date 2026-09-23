# Deployed Acceptance Harness

The deployed acceptance harness is a production-like black-box runner for the already deployed FreightBridge services. It exercises public HTTP endpoints for:

- Apex Partner Simulator
- FreightBridge API
- Midwest Partner Simulator
- Railway/SFTPGo transport through the deployed services

It replaces the long manual Postman sequence for full milestone acceptance. Postman collections remain useful for debugging individual requests.

## Security

The harness reads configuration from environment variables only. It does not load committed secrets and does not need direct SFTP credentials because the deployed services perform SFTP operations.

Never commit:

- bearer tokens
- database URLs
- SFTP usernames/passwords
- private keys
- Supabase secrets

Safe example names are in:

```bash
scripts/acceptance/.env.example
```

## Required Environment Variables

```bash
APEX_BASE_URL=
APEX_BEARER_TOKEN=
FREIGHTBRIDGE_BASE_URL=
MIDWEST_BASE_URL=
MIDWEST_BEARER_TOKEN=
```

Optional:

```bash
APEX_READONLY_TOKEN=
MIDWEST_READONLY_TOKEN=
OPERATIONS_API_BEARER_TOKEN=
DATABASE_URL=
```

If a read-only token is not provided, the harness uses the write token for reads. That matches the simulator security contract where write tokens are allowed to read.

## Local Usage

Install dependencies in any Python 3.12 environment:

```bash
python -m pip install -r scripts/acceptance/requirements.txt
```

Run Milestone 12:

```bash
python scripts/acceptance/milestone12.py
```

Run Milestone 13:

```bash
python scripts/acceptance/milestone13.py
```

Run Milestone 14:

```bash
python scripts/acceptance/milestone14.py
```

Milestone 14 requires `OPERATIONS_API_BEARER_TOKEN`. Milestones 12 and 13 do not.

Useful options:

```bash
python scripts/acceptance/milestone12.py --load-id LOAD503
python scripts/acceptance/milestone12.py --verbose
python scripts/acceptance/milestone12.py --skip-db
python scripts/acceptance/milestone12.py --keep-going
python scripts/acceptance/milestone12.py --print-env
```

When `--load-id` is omitted, the harness generates a fresh ID like:

```text
LOAD0923143059A1B2
```

The generated ID is `LOAD` plus a UTC timestamp and four random uppercase alphanumeric characters. It stays within Apex load ID validation and avoids repeated-run collisions.

## Milestone 12 Automated Sequence

The runner performs the full deployed happy path:

1. Warm up Apex, FreightBridge, and Midwest with `/health` and `/readiness`.
2. Check SFTP readiness through FreightBridge and Midwest endpoints.
3. Create a synthetic Apex load using ABC Factory in Aurora, IL and XYZ Warehouse in Detroit, MI.
4. Dispatch the Apex load to FreightBridge.
5. Dispatch FreightBridge's Midwest 204 to SFTP `/inbound`.
6. Poll Midwest inbound SFTP and verify the specific 204 file was archived.
7. Read back the Midwest load and verify `tenderStatus = PENDING`.
8. Accept the Midwest tender and capture the carrier load number.
9. Dispatch the Midwest 990 to SFTP `/outbound`.
10. Poll FreightBridge outbound SFTP and verify the specific 990 file was archived.
11. Read back Apex tender status and verify `ACCEPTED`.
12. Create, dispatch, and poll all four 214 events:
    - `PICKED_UP -> AF`
    - `IN_TRANSIT -> X6`
    - `DELIVERED -> D1`
    - late `ARRIVED -> X1`
13. Verify Apex current shipment status remains `DELIVERED`.
14. Verify Apex history preserves the out-of-order condition:
    - `ARRIVED.occurredAt < DELIVERED.occurredAt`
    - `ARRIVED.receivedAt > DELIVERED.receivedAt`
15. Verify Midwest event readback includes the four business events.
16. Optionally verify the deployed database directly when `DATABASE_URL` is provided.

## Timeout And Cold-Start Handling

Render free services may cold start. The harness retries safe `GET` warm-up and readback operations with bounded backoff.

Mutating `POST` operations are not blindly retried. A client timeout does not prove the server rolled back the operation. For the duplicate-sensitive Apex load creation step, a timeout triggers a readback check for the selected load ID before deciding whether to continue.

## Optional DB Verification

If `DATABASE_URL` is provided and `--skip-db` is not used, the harness verifies:

- canonical shipment tender/current status
- four canonical `shipment_events`
- out-of-order `occurred_at` versus `received_at`
- four inbound `214` SFTP/X12 integration transactions
- four outbound `APEX_SHIPMENT_STATUS` REST/JSON child transactions
- child transactions reference `214` parent transactions
- four Midwest outbound `214` rows are `SFTP` and `DELIVERED`

If `DATABASE_URL` is absent, the runner prints:

```text
[SKIP] DB verification - DATABASE_URL not provided
```

This is expected and is not a failure.

## Failure Output

Failures include:

- step name
- HTTP status, when available
- safe response body
- correlation ID, when available

Bearer tokens and database URLs are redacted from output.

Exit codes:

- `0` success
- non-zero failure

## GitHub Actions

Workflow:

```text
Deployed Acceptance
```

File:

```text
.github/workflows/deployed-acceptance.yml
```

The workflow is `workflow_dispatch` only because it mutates shared deployed test data. It does not run on push or pull request.

Supported inputs:

- `milestone`: `milestone12`, `milestone13`, or `milestone14`
- `load_id`: optional, blank means generate a fresh load ID
- `run_db_verification`: passes `DATABASE_URL` only when enabled
- `verbose`: prints safe request progress

## GitHub Repository Secrets

Create these once in GitHub:

```text
APEX_BASE_URL
APEX_BEARER_TOKEN
APEX_READONLY_TOKEN
FREIGHTBRIDGE_BASE_URL
MIDWEST_BASE_URL
MIDWEST_BEARER_TOKEN
MIDWEST_READONLY_TOKEN
DATABASE_URL
OPERATIONS_API_BEARER_TOKEN
```

`APEX_READONLY_TOKEN`, `MIDWEST_READONLY_TOKEN`, and `DATABASE_URL` are optional. `OPERATIONS_API_BEARER_TOKEN` is required only for Milestone 14. Add `DATABASE_URL` only if you want GitHub to run direct SQL verification.

To create repository secrets:

1. Open the GitHub repository.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Select `Actions`.
5. Click `New repository secret`.
6. Add one secret name and value at a time.

These are GitHub Actions secrets, not Render environment variables. Render still needs its own service runtime configuration.

## Normal CI

The standard CI workflow runs mocked unit tests for the harness:

```bash
python -m pytest scripts/acceptance/tests
```

CI never calls live deployed services automatically.
