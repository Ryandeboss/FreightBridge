# Supabase Secret Boundaries

FreightBridge does not require real Supabase credentials during this foundation milestone.

## Backend-only secrets

Keep these values only in Render or another backend secret store:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

The service-role key bypasses row-level security and must never be exposed to browser code, logs, screenshots, or committed files.

## Backend configuration

These values are read by the FastAPI service:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

The anon key can be safe in public clients only when Supabase row-level security policies are correctly designed. In this project foundation, the frontend does not need Supabase credentials.

## Frontend configuration

The frontend should call FreightBridge API through:

- `VITE_API_BASE_URL`

Do not add Supabase keys to the frontend unless a later feature explicitly requires public Supabase client access and row-level security has been reviewed.
