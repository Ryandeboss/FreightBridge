# Milestone 20 Regression Hardening

Milestone 20 turns the existing tests into a deliberate regression system. It adds contract tests, coverage gates, ephemeral PostgreSQL migration validation, and a deployed meta-regression wrapper.

## Test Layers

- REST/API contract regression protects route methods and important response fields.
- X12/EDI regression protects deterministic 204 controls, envelope counts, profile identifiers, 990, 997, and 214 semantics.
- Integration-state regression protects idempotency, manual retry, mapping audit metadata, failure classification, and out-of-order shipment status.
- UI regression protects Analyst Console routes and workflows with mocked HTTP.
- Database regression applies migrations 001-011 from scratch to PostgreSQL 16 and runs real repository smoke tests.

## Coverage Gates

- FreightBridge API: `pytest --cov=app --cov-fail-under=75`
- Apex simulator: `pytest --cov=app --cov-fail-under=75`
- Midwest simulator: `pytest --cov=app --cov-fail-under=70`
- Analyst UI: `npm run test:coverage` with a 60% line threshold

Coverage reports are uploaded as GitHub Actions artifacts. No external coverage service or token is required.

The FreightBridge API gate uses a service-local `.coveragerc` to keep environment-dependent database repository modules out of the ordinary unit coverage denominator. Those modules are covered by the PostgreSQL migration/regression job, which applies migrations 001-011 and exercises the real repositories against a disposable database.

## Database Safety

Database regression tests are skipped unless `TEST_DATABASE_URL` is set. Normal CI sets it only to the GitHub Actions PostgreSQL service. Tests must never target Supabase.

## Local Commands

```bash
cd services/freightbridge-api
python -m pytest --cov=app --cov-report=term --cov-fail-under=75

cd services/apex-partner-sim
python -m pytest --cov=app --cov-report=term --cov-fail-under=75

cd services/midwest-partner-sim
python -m pytest --cov=app --cov-report=term --cov-fail-under=70

cd apps/analyst-ui
npm run lint
npm run test:coverage
npm run build
```

Database chain, with a local disposable database:

```bash
set TEST_DATABASE_URL=postgresql://user:password@localhost:5432/freightbridge_test
python scripts/ci/apply_migrations.py
cd services/freightbridge-api
python -m pytest tests/test_database_regression.py
```

## Deployed Regression Pack

Milestone 20 deployed regression runs Milestone 18, then Milestone 19, using separate load IDs:

```bash
python -m playwright install chromium
python scripts/acceptance/milestone20.py --verbose
```

It reuses the existing acceptance scripts rather than copying their logic.

## Boundaries

Milestone 20 adds no migration 012, no production endpoint, no new runtime variable, and no new production secret. Normal CI contacts no external deployed service.
