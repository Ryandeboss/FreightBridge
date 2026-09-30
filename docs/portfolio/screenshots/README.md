# Screenshot Capture Plan

Capture only real deployed application screens. Do not commit fake screenshots, generated mock screenshots, blank placeholders, or stock imagery.

Never capture or show operations tokens, Authorization headers, database URLs, SFTP private keys, Supabase secrets, GitHub secrets, or hosting-provider environment values.

| Suggested filename | Screen | What should be visible | Crop/redact guidance |
| --- | --- | --- | --- |
| `training-complete.png` | Training Desk after Mission 10 | 10 / 10 complete, inbox 0, Training Complete summary | no token/access screen |
| `training-roadmap.png` | Training Desk roadmap | Missions 1–10 marked complete | include enough UI to show Training Mode context |
| `healthy-flow-214.png` | Healthy Flow Part 4 | 214 progression and Apex-facing status evidence | keep safe X12 evidence only |
| `final-shift-investigation.png` | Mission 10 | independent investigation, case correlation, `SHIPMENT_NOT_FOUND` | synthetic IDs are safe; no credentials |
| `final-shift-recovery.png` | Mission 10 verification | corrected shipment reference and Apex `PICKED_UP` evidence | do not show any secret metadata |
| `replay-sequence-clinic.png` | Advanced Practice | replay suppression and late-event/current-status proof | show before/after evidence, not credentials |
| `compact-analyst-tools.png` | Training Mode toolset | Transaction Search or Business Trace plus in-desk navigation | raw data can stay collapsed |
| `business-trace-delivered.png` | Advanced Console Business Trace | load trace and related transactions/events | crop browser/profile UI if needed |
| `transaction-detail-timeline.png` | Advanced Console Transaction Detail | processing timeline and mapping audit | no auth headers |
| `failure-detail.png` | Advanced Console Failure Detail | code/category/stage/retryability | synthetic payload metadata only |
| `mapping-detail-version.png` | Mapping Detail | active version and structured mapping rules | no environment configuration |
| `github-actions-final.png` | GitHub Actions | green current CI run | do not show repository secrets/settings |

For a five-minute walkthrough, prioritize `training-complete.png`, `final-shift-investigation.png`, `replay-sequence-clinic.png`, and `github-actions-final.png`.
