# Deployment Notes

This project is not ready for production traffic. These notes describe the intended hosting layout once platform accounts and secrets are available.

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
- Required environment variables:
  - `APP_ENV`
  - `ALLOWED_ORIGINS`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`

## Supabase

- Create a Supabase project when the backend needs persistence.
- Store database migrations under `infrastructure/supabase/migrations`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` backend-only.

## Railway

- Future SFTPGo deployment belongs under Railway.
- Use Railway public TCP proxying for SFTP ingress when that milestone begins.
- Required placeholders are documented in `infrastructure/railway/README.md`.
