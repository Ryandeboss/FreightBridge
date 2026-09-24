# Deployment Notes

This project is a portfolio lab and is not ready for production traffic. These notes describe the current hosting layout and secret boundaries.

## Vercel

- Project root: `apps/analyst-ui`
- Build command: `npm run build`
- Output directory: `dist`
- Required environment variables:
  - `VITE_API_BASE_URL`
  - `VITE_APP_ENV`

## Render

- Service root: `services/freightbridge-api`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Preferred environment variables:
  - `APP_ENV`
  - `ALLOWED_ORIGINS`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY`
  - `DATABASE_URL`
- Legacy names temporarily accepted:
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Health endpoints:
  - `GET /health` checks API liveness only.
  - `GET /readiness` checks configuration and Supabase PostgreSQL connectivity.

## Supabase

- Supabase hosts PostgreSQL for the deployed synthetic environment.
- Database migrations live under `infrastructure/supabase/migrations`.
- Keep `SUPABASE_SECRET_KEY` and `DATABASE_URL` backend-only.

## Railway

- SFTPGo runs on Railway for the Midwest SFTP exchange.
- Railway public TCP proxying is used for SFTP ingress.
- Required placeholders are documented in `infrastructure/railway/README.md`.
