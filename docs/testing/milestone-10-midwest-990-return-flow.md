# Milestone 10 Midwest 990 Return Flow Acceptance

Milestone 10 completes the temporary REST test-harness loop for tender decisions:

```text
Apex -> FreightBridge -> Midwest 204 -> Midwest tender decision -> Midwest 990 -> FreightBridge -> Apex
```

## Scope

- Midwest simulator can accept or reject a Midwest-owned pending load.
- Accepted tenders assign a Midwest carrier load number.
- Rejected tenders require a rejection reason.
- Midwest generates an outbound X12 004010 990 and stores it before any FreightBridge delivery attempt.
- Midwest can dispatch the stored 990 to FreightBridge over the temporary REST test harness.
- FreightBridge authenticates Midwest inbound X12, parses and validates the generic X12 envelope, maps Midwest-specific 990 data to a canonical `TenderResponse`, updates canonical shipment tender status, and forwards the decision to Apex JSON.
- Apex exposes readback at `GET /v1/loads/{loadId}/tender-status`.

## Environment

FreightBridge:

```text
MIDWEST_INBOUND_BEARER_TOKEN=<token Midwest uses when sending 990s>
APEX_SIM_BASE_URL=https://<apex-render-service>.onrender.com
APEX_SIM_BEARER_TOKEN=<Apex write token>
```

Midwest simulator:

```text
FREIGHTBRIDGE_API_BASE_URL=https://<freightbridge-render-service>.onrender.com
FREIGHTBRIDGE_MIDWEST_BEARER_TOKEN=<same value as FreightBridge MIDWEST_INBOUND_BEARER_TOKEN>
```

## Manual Smoke Test

1. Ensure `LOAD500` exists in FreightBridge and Midwest by running the Apex dispatch and FreightBridge-to-Midwest 204 direct dispatch flow from Milestone 9.
2. Accept the Midwest load:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD500/tender-decisions
Authorization: Bearer {{midwestBearerToken}}
Content-Type: application/json

{
  "decision": "ACCEPTED"
}
```

3. Dispatch the generated 990:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD500/tender-response/dispatch-direct
Authorization: Bearer {{midwestBearerToken}}
```

Expected: `202`, `DELIVERED_TO_FREIGHTBRIDGE_TEST_GATEWAY`.

4. Verify Apex readback:

```http
GET {{apexBaseUrl}}/v1/loads/LOAD500/tender-status
Authorization: Bearer {{apexReadonlyToken}}
```

Expected: `currentTenderDecision` is `ACCEPTED` and the latest response contains the Midwest carrier load number.

## Regression Coverage

- Midwest 990 generator matches accepted and rejected golden fixtures.
- Midwest decision endpoint validates accepted/rejected conditional fields.
- Unknown loads return `404`; already decided loads return `409`.
- FreightBridge inbound 990 accepts raw `application/edi-x12`.
- FreightBridge duplicate/decided tender responses fail with `409` and failed audit state.
- Apex forwarding creates a child outbound audit transaction; parent inbound success is retained if Apex delivery fails.
- Apex tender-status readback returns the latest tender response.

## Explicitly Deferred

- SFTP transport.
- X12 997 generation or processing.
- X12 214 shipment-status processing.
