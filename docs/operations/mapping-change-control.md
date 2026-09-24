# Mapping Change Control

Mapping profiles are now stored in PostgreSQL and consumed by runtime services.

## Profile Lifecycle

Supported statuses:

- `ACTIVE`: the single profile version used for a mapping key
- `DRAFT`: editable candidate cloned from an active profile
- `ARCHIVED`: prior active profile version
- `ABANDONED`: discarded draft

Operators clone an active profile, edit JSON settings or rule notes, validate the draft, and either activate or abandon it. Activation archives the prior active version for the same `mappingKey`.

## Runtime Behavior

Production request paths load the active profile for:

- `APEX_LOAD_TO_CANONICAL`
- `CANONICAL_TO_MWCX_204`
- `MWCX_990_TO_CANONICAL`
- `MWCX_214_TO_CANONICAL`
- `MWCX_997_TO_ACK`

Missing active profile:

```text
ACTIVE_MAPPING_NOT_FOUND
```

Invalid active profile:

```text
INVALID_MAPPING_CONFIGURATION
```

Successful mapped transactions record `mappingKey`, `mappingProfileId`, and `mappingProfileVersion`.

## API

All endpoints require `OPERATIONS_API_BEARER_TOKEN`.

```text
GET   /api/configuration/mappings
GET   /api/configuration/mappings/{mappingId}
POST  /api/configuration/mappings/{mappingId}/clone-draft
PATCH /api/configuration/mappings/{mappingId}
PATCH /api/configuration/mappings/{mappingId}/rules/{ruleId}
POST  /api/configuration/mappings/{mappingId}/validate
POST  /api/configuration/mappings/{mappingId}/activate
POST  /api/configuration/mappings/{mappingId}/abandon
```

This is intentionally not a generic EDI designer. The profile schema validates only current FreightBridge partner flows.
