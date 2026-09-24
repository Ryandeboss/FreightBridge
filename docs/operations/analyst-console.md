# Analyst Console

Milestone 16 replaces the placeholder Vercel page with a protected React operations console for the existing `/api/operations` surface.

## Security Model

The console does not compile an operations token into the Vite bundle. There is intentionally no `VITE_OPERATIONS_API_BEARER_TOKEN`.

An operator enters the operations bearer token in the browser. The app validates it with:

```text
GET /api/operations/summary
```

When validation succeeds, the token is stored only in browser `sessionStorage` under:

```text
freightbridge.operationsToken
```

The token is sent as an `Authorization: Bearer ...` header at runtime. `Lock Console` removes the session token and protected route state. A `401` from any protected request clears the session and returns the user to the access screen.

## Routes

The UI uses `HashRouter` so the deployed static app works without server-side route rewrites:

- `#/dashboard`
- `#/transactions`
- `#/transactions/:transactionId`
- `#/failures`
- `#/failures/:errorId`
- `#/trace`
- `#/trace/:businessIdentifier`
- `#/lab`
- `#/partners`
- `#/partners/:partnerCode`
- `#/mappings`
- `#/mappings/:mappingId`

## Console Areas

- Dashboard: timeframe cards, success rate, document/error breakdowns, recent transactions, recent failures, and compact readiness.
- Transactions: server-backed filters, pagination, status badges, and detail links.
- Transaction detail: metadata, copy controls, timeline logs, errors, parent/child/replay links, retry attempts, and a manual retry dialog for eligible failed 204 transactions.
- Failures: server-backed queue filters, failure detail, resolve, and reopen.
- Business Trace: business ID search with transaction chain and relationship links.
- Integration Lab: scenario creation, step-by-step execution, run history, happy-path workflow lanes, 204 preview, 997/990 distinction, 214 progression, controlled Failure Drills, Expected vs Observed failure comparison, read-only payload previews, and links back to Business Trace, Transaction Detail, Failure Detail, and the Failure Queue.
- Partners: safe partner-field edits and capability toggles without exposing secrets.
- Mappings: active profile inspection, draft clone/edit/validate/activate/abandon workflow, rules, versions, and change history.

The console never renders secrets. Payload locations, hashes, mapping profile identifiers, synthetic Lab inputs, and Lab-generated read-only JSON/X12 previews may be displayed when returned by protected operations endpoints. Partner simulator tokens, inbound bearer tokens, SFTP credentials, database URLs, and Supabase secrets remain backend-only.

Failure Drills are not a raw-message editor. The UI does not provide arbitrary JSON, X12, HTTP header, URL, SQL, token, host, or SFTP credential inputs. Analysts select one predefined drill and may optionally provide a safe load ID. A drill can show `Lab Run: SUCCEEDED` beside `Integration Transaction: FAILED`; that means the expected synthetic failure was produced, persisted, and matched to the configured classification.

## Deployment Notes

Vercel needs only safe frontend variables:

```text
VITE_API_BASE_URL
VITE_APP_ENV
```

Render must include the actual operations secret:

```text
OPERATIONS_API_BEARER_TOKEN
```

If a new Vercel production domain is used, add it to the FreightBridge API `ALLOWED_ORIGINS` setting. Do not broaden CORS to `*`.
