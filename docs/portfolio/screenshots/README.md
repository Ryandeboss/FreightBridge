# Screenshot Capture Plan

Do not commit fake screenshots, blank placeholders, generated mock screenshots, or stock images. Capture only real deployed application screenshots when it is safe to do so.

Never capture or show:

- Operations bearer token.
- Authorization headers.
- Database URLs.
- SFTP private key.
- Supabase secret key.
- GitHub secrets.
- Render, Vercel, Railway, or Supabase environment values.

| Suggested filename | Screen | What should be visible | Crop/redact guidance |
| --- | --- | --- | --- |
| `dashboard-overview.png` | Dashboard | service status, recent operational summary | crop browser chrome if it exposes accounts |
| `integration-lab-happy-paths.png` | Integration Lab Happy Paths | Full Shipment Lifecycle card or form | ensure token fields are not visible |
| `lab-run-full-lifecycle.png` | Successful Lab run detail | step list with succeeded statuses | redact generated IDs only if needed for sharing |
| `midwest-204-preview.png` | Lab or transaction 204 preview | document type, profile, safe X12 preview | no credentials or headers |
| `business-trace-delivered.png` | Business Trace | load id trace, related transactions/events | crop unrelated browser/profile UI |
| `transaction-detail-timeline.png` | Transaction Detail | processing timeline, status, mapping audit | no raw secrets or auth headers |
| `failure-drills.png` | Failure Drills | predefined drill cards | no token entry state |
| `expected-observed-failure.png` | Failure drill result | expected vs observed classification | verify payload preview is synthetic only |
| `failure-detail-unsupported-214.png` | Failure Detail | `UNSUPPORTED_AT7_CODE`, category/stage | no secret-bearing metadata |
| `mapping-detail-version.png` | Mapping Detail | mapping key, active version, rules | no environment configuration |
| `github-actions-milestone20.png` | GitHub Actions | green Milestone 20/CI run | do not show private settings pages |
