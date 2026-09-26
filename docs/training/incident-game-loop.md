# Beginner Incident Game Loop

Missions 2-4 teach incident handling from the point of view of a FreightBridge Integration Support Analyst. The learner does not inspect Apex private systems, Midwest private systems, secrets, credentials, or database internals.

Each beginner incident follows the same phases:

1. `BRIEFING`: Mike gives the operational symptom.
2. `INVESTIGATE`: the learner runs a real Integration Lab failure drill and inspects FreightBridge evidence.
3. `DIAGNOSE`: the learner identifies the last healthy checkpoint and the first failed checkpoint.
4. `PLAN`: the learner chooses a safe remediation plan.
5. `ACT`: the learner runs a corrected healthy retry through `FULL_SHIPMENT_LIFECYCLE`.
6. `VERIFY`: the learner confirms the retry reached a healthy lifecycle state.
7. `REPORT`: the learner writes Mike a status update.
8. `DEBRIEF`: the mission records progress and summarizes the lesson.

The mission UI uses real Lab scenarios for the failed path and the healthy recovery path. It does not fake a frontend-only incident result.

## Evidence Boundary

The learner can use only FreightBridge-owned evidence:

- Lab run status and step summaries
- Integration transaction and error metadata exposed by FreightBridge
- Safe payload previews
- Partner messages framed as claims
- Mike's operational briefing
- Healthy baseline checkpoints from Mission 1

The learner must not rely on hidden Apex token values, SFTP credentials, database URLs, Supabase secrets, or private partner logs.
