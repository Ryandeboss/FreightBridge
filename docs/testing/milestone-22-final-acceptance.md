# Milestone 22 Final Acceptance

Milestone 22 is the final MVP deployment audit and acceptance milestone. It does not introduce Phase 2 functionality, new migrations, new secrets, new endpoints, or application business-logic changes.

## Purpose

Milestone 22 proves that the deployed MVP is ready for portfolio demonstration by checking deployment readiness, then reusing the existing deployed regression pack.

## Automated Sequence

The runner is:

```bash
python scripts/acceptance/milestone22.py
```

It performs three phases:

| Phase | Scope | Evidence |
| --- | --- | --- |
| A | Deployment preflight | Service health/readiness, SFTP readiness, operations summary, configuration partners, active mapping profiles, Lab catalog, and Analyst UI navigation. |
| B | Regression pack | Invokes `scripts/acceptance/milestone20.py` as a child process through `sys.executable` and an explicit argument list. |
| C | Postflight | Rechecks FreightBridge readiness, operations summary, and Integration Lab readiness after the regression pack. |

## Preflight Checks

- Apex `GET /health` and `GET /readiness`.
- FreightBridge `GET /health` and `GET /readiness`, including `configuration`, `database`, and `domain_schema`.
- Midwest `GET /health` and `GET /readiness`.
- FreightBridge Midwest SFTP readiness at `GET /api/integrations/midwest/sftp/readiness`.
- Midwest SFTP readiness at `GET /v1/sftp/readiness`.
- Operations summary stable fields at `GET /api/operations/summary`.
- APEX and MWCX partners plus readable capabilities.
- Active mapping profiles for:
  - `APEX_LOAD_TO_CANONICAL`
  - `CANONICAL_TO_MWCX_204`
  - `MWCX_990_TO_CANONICAL`
  - `MWCX_214_TO_CANONICAL`
  - `MWCX_997_TO_ACK`
- Integration Lab readiness with `FULL_SHIPMENT_LIFECYCLE` and the current Milestone 19 failure drills.
- Analyst UI unlock and navigation visibility.

## GitHub Actions

The `Deployed Acceptance` workflow includes a `milestone22` choice. It uses the same deployed-service inputs as Milestone 20 and does not pass `DATABASE_URL`.

Milestone 22 is `workflow_dispatch` only because it can create shared synthetic test data through the Milestone 20 child run.

## Boundaries

Milestone 22 must not weaken Milestone 18, 19, or 20 assertions. It must not change migrations, deployed application behavior, SFTP configuration, Render configuration, Vercel configuration, Supabase configuration, or start Milestone 23/Phase 2 work.
