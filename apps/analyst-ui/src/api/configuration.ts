import { requestJson, type QueryValue } from './client';

export type Capability = {
  id: string;
  partnerId: string;
  direction: string;
  documentType: string;
  transport: string;
  messageFormat: string;
  protocolVersion: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TradingPartner = {
  id: string;
  partnerCode: string;
  name: string;
  businessRole: string;
  integrationStyle: string;
  active: boolean;
  description: string | null;
  supportContact: string | null;
  configRevision: number;
  capabilitiesEnabled: number;
  capabilitiesTotal: number;
  capabilities: Capability[];
  createdAt: string;
  updatedAt: string;
};

export type MappingRule = {
  id: string;
  mappingProfileId: string;
  sequence: number;
  ruleKey: string;
  sourcePath: string | null;
  targetPath: string | null;
  transformation: string;
  required: boolean;
  qualifierOrCondition: string | null;
  failureCode: string | null;
  configuration: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MappingProfile = {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  mappingKey: string;
  name: string;
  description: string | null;
  direction: string;
  sourceFormat: string;
  targetFormat: string;
  sourceDocumentType: string;
  targetDocumentType: string;
  versionNumber: number;
  status: string;
  settings: Record<string, unknown>;
  validationStatus: string;
  validationErrors: Array<Record<string, unknown>>;
  basedOnProfileId: string | null;
  changeNote: string | null;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
  activatedAt: string | null;
  rules: MappingRule[];
  versions: MappingProfile[];
};

export type ConfigurationChange = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  note: string | null;
  source: string;
  createdAt: string;
};

export type MappingSearchResponse = {
  limit: number;
  offset: number;
  count: number;
  mappings: MappingProfile[];
};

export type ChangeSearchResponse = {
  limit: number;
  offset: number;
  count: number;
  changes: ConfigurationChange[];
};

export type ValidationResult = {
  status: 'VALID' | 'INVALID';
  errors: Array<Record<string, unknown>>;
};

export function fetchPartners(token: string): Promise<TradingPartner[]> {
  return requestJson('/api/configuration/partners', { token });
}

export function fetchPartner(token: string, partnerCode: string): Promise<TradingPartner> {
  return requestJson(`/api/configuration/partners/${encodeURIComponent(partnerCode)}`, { token });
}

export function updatePartner(
  token: string,
  partnerCode: string,
  body: Pick<Partial<TradingPartner>, 'name' | 'description' | 'supportContact' | 'active'>,
): Promise<TradingPartner> {
  return requestJson(`/api/configuration/partners/${encodeURIComponent(partnerCode)}`, {
    token,
    method: 'PATCH',
    body,
  });
}

export function updateCapability(
  token: string,
  capabilityId: string,
  enabled: boolean,
  note?: string,
): Promise<Capability> {
  return requestJson(`/api/configuration/capabilities/${capabilityId}`, {
    token,
    method: 'PATCH',
    body: { enabled, note: note?.trim() || null },
  });
}

export function fetchMappings(
  token: string,
  filters: Record<string, QueryValue> = {},
): Promise<MappingSearchResponse> {
  return requestJson('/api/configuration/mappings', { token, query: filters });
}

export function fetchMapping(token: string, mappingId: string): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}`, { token });
}

export function cloneDraft(token: string, mappingId: string, changeNote?: string): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}/clone-draft`, {
    token,
    method: 'POST',
    body: { changeNote: changeNote?.trim() || null },
  });
}

export function updateMapping(
  token: string,
  mappingId: string,
  body: { name?: string; description?: string | null; changeNote?: string | null; settings?: Record<string, unknown> },
): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}`, {
    token,
    method: 'PATCH',
    body,
  });
}

export function updateMappingRule(
  token: string,
  mappingId: string,
  ruleId: string,
  body: { configuration?: Record<string, unknown>; notes?: string | null },
): Promise<MappingRule> {
  return requestJson(`/api/configuration/mappings/${mappingId}/rules/${ruleId}`, {
    token,
    method: 'PATCH',
    body,
  });
}

export function validateMapping(token: string, mappingId: string): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}/validate`, { token, method: 'POST' });
}

export function activateMapping(token: string, mappingId: string): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}/activate`, { token, method: 'POST' });
}

export function abandonMapping(token: string, mappingId: string): Promise<MappingProfile> {
  return requestJson(`/api/configuration/mappings/${mappingId}/abandon`, { token, method: 'POST' });
}

export function fetchConfigurationChanges(
  token: string,
  filters: Record<string, QueryValue> = {},
): Promise<ChangeSearchResponse> {
  return requestJson('/api/configuration/changes', { token, query: filters });
}
