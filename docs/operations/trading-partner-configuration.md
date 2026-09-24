# Trading Partner Configuration

Milestone 17 adds safe, operations-owned trading partner configuration for the existing Apex and Midwest partner records.

## Scope

Operators can:

- view configured partners
- edit safe descriptive fields: `name`, `description`, `supportContact`, and `active`
- view and enable/disable seeded capabilities
- inspect configuration change history

Operators cannot:

- create arbitrary partners
- edit partner codes, roles, protocol credentials, bearer tokens, SFTP secrets, or database secrets
- configure unsupported document families or unsupported X12 versions

## Capability Gates

Runtime integration services check `trading_partner_capabilities` before processing configured flows. Disabled capabilities fail deterministically with:

```text
PARTNER_CAPABILITY_DISABLED
```

Current seeded capabilities cover Apex REST JSON load tenders and outbound callbacks, Midwest 204 outbound over SFTP and REST test harness, Midwest 990 inbound over SFTP and REST test harness, and Midwest 214/997 inbound over SFTP.

## API

All endpoints require `Authorization: Bearer <OPERATIONS_API_BEARER_TOKEN>`.

```text
GET   /api/configuration/partners
GET   /api/configuration/partners/{partnerCode}
PATCH /api/configuration/partners/{partnerCode}
GET   /api/configuration/partners/{partnerCode}/capabilities
PATCH /api/configuration/capabilities/{capabilityId}
GET   /api/configuration/changes
```

Every write records `configuration_change_log`.
