# Mapping Documentation

This folder holds executable mapping requirements and future mapping notes.

- [Apex load tender to canonical shipment](apex-load-tender-to-canonical.md)
- [Canonical shipment to Midwest 204](canonical-to-midwest-204.md)
- [Midwest 214 to canonical shipment event](midwest-214-to-canonical-event.md)
- [Midwest 997 functional acknowledgment](midwest-997-functional-acknowledgment.md)

Milestone 17 stores the current partner-specific mapping profiles in the database with versioned draft/active/archive change control. The supported mapping keys remain explicit:

- `APEX_LOAD_TO_CANONICAL`
- `CANONICAL_TO_MWCX_204`
- `MWCX_990_TO_CANONICAL`
- `MWCX_214_TO_CANONICAL`
- `MWCX_997_TO_ACK`

Generic arbitrary mapping remains intentionally out of scope.
