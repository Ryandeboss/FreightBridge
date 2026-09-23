# Milestone 14 Operational Observability Acceptance

Milestone 14 verifies operations APIs and the failure queue with a real duplicate-shipment failure.

## Required Deployment Setup

Apply:

```text
infrastructure/supabase/migrations/20260923_008_add_operational_observability.sql
```

Create one strong random token and set the same value in:

- FreightBridge Render env var: `OPERATIONS_API_BEARER_TOKEN`
- GitHub Actions repository secret: `OPERATIONS_API_BEARER_TOKEN`

No Apex or Midwest service needs this token.

## Automated Flow

Run:

```bash
python scripts/acceptance/milestone14.py
```

The harness:

1. Warms Apex, FreightBridge, Midwest, and SFTP readiness.
2. Creates a fresh Apex load.
3. Dispatches Apex to FreightBridge successfully.
4. Dispatches the same load again and expects `409`.
5. Queries `/api/operations/transactions`.
6. Verifies one successful and one failed `APEX_LOAD_TENDER`.
7. Reads failed transaction detail.
8. Verifies `DUPLICATE_TRANSACTION` / `DUPLICATE_SHIPMENT`.
9. Resolves the error.
10. Verifies the failed transaction remains `FAILED`.
11. Verifies unresolved/resolved error queue behavior.
12. Dispatches the load's 204 over SFTP.
13. Lets Midwest consume the 204.
14. Verifies business trace includes successful outbound `204` over `SFTP`.
15. Verifies operations summary response shape.

The generated records are not cleaned up. They are useful portfolio audit history.

## GitHub Actions

Use:

```text
Actions -> Deployed Acceptance -> Run workflow -> milestone14
```

Leave `load_id` blank for a fresh generated load ID unless intentionally rerunning a known scenario.

## Boundaries

Milestone 14 does not implement retry, idempotency, failure injection, Analyst UI pages, 210, SOAP, AS2, MDN, 999, or TA1.
