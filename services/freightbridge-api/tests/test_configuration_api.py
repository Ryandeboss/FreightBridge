from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.routes.configuration import get_configuration_repository
from app.core.config import get_settings
from app.main import app


TOKEN = 'ops-test-token'


@pytest.fixture(autouse=True)
def configuration_state(monkeypatch):
  get_settings.cache_clear()
  monkeypatch.setenv('OPERATIONS_API_BEARER_TOKEN', TOKEN)
  app.dependency_overrides.clear()
  yield
  app.dependency_overrides.clear()
  get_settings.cache_clear()


def auth_headers() -> dict[str, str]:
  return {'Authorization': f'Bearer {TOKEN}'}


def test_configuration_auth_rejects_missing_token() -> None:
  response = TestClient(app).get('/api/configuration/partners')

  assert response.status_code == 401
  assert response.json()['detail']['error']['code'] == 'AUTHENTICATION_ERROR'


def test_partner_list_and_detail_do_not_expose_secrets() -> None:
  repository = FakeConfigurationRepository()
  app.dependency_overrides[get_configuration_repository] = lambda: repository
  client = TestClient(app)

  list_response = client.get('/api/configuration/partners', headers=auth_headers())
  detail_response = client.get('/api/configuration/partners/APEX', headers=auth_headers())

  assert list_response.status_code == 200
  assert detail_response.status_code == 200
  assert list_response.json()[0]['partnerCode'] == 'APEX'
  assert detail_response.json()['capabilities'][0]['documentType'] == 'APEX_LOAD_TENDER'
  assert 'secret' not in detail_response.text.lower()


def test_partner_update_rejects_read_only_fields() -> None:
  repository = FakeConfigurationRepository()
  app.dependency_overrides[get_configuration_repository] = lambda: repository

  response = TestClient(app).patch(
    '/api/configuration/partners/APEX',
    headers=auth_headers(),
    json={'partnerCode': 'MWCX'},
  )

  assert response.status_code == 422


def test_partner_update_and_capability_toggle() -> None:
  repository = FakeConfigurationRepository()
  app.dependency_overrides[get_configuration_repository] = lambda: repository
  client = TestClient(app)

  partner_response = client.patch(
    '/api/configuration/partners/APEX',
    headers=auth_headers(),
    json={'name': 'Apex Logistics Updated', 'supportContact': 'ops@example.com', 'active': True},
  )
  capability_response = client.patch(
    f'/api/configuration/capabilities/{repository.capability_id}',
    headers=auth_headers(),
    json={'enabled': False, 'note': 'Pause test flow'},
  )

  assert partner_response.status_code == 200
  assert partner_response.json()['name'] == 'Apex Logistics Updated'
  assert capability_response.status_code == 200
  assert capability_response.json()['enabled'] is False
  assert repository.changes[-1]['action'] == 'CAPABILITY_DISABLE'


def test_mapping_draft_validate_activate_abandon_and_changes() -> None:
  repository = FakeConfigurationRepository()
  app.dependency_overrides[get_configuration_repository] = lambda: repository
  client = TestClient(app)

  mappings = client.get('/api/configuration/mappings?status=ACTIVE', headers=auth_headers())
  active_id = mappings.json()['mappings'][0]['id']
  draft = client.post(
    f'/api/configuration/mappings/{active_id}/clone-draft',
    headers=auth_headers(),
    json={'changeNote': 'Change qualifier'},
  )
  draft_id = draft.json()['id']
  updated = client.patch(
    f'/api/configuration/mappings/{draft_id}',
    headers=auth_headers(),
    json={'changeNote': 'Edit settings', 'settings': {'expectedSender': 'MWCX'}},
  )
  validated = client.post(f'/api/configuration/mappings/{draft_id}/validate', headers=auth_headers())
  activated = client.post(f'/api/configuration/mappings/{draft_id}/activate', headers=auth_headers())
  changes = client.get('/api/configuration/changes?entityType=MAPPING_PROFILE', headers=auth_headers())

  assert mappings.status_code == 200
  assert draft.status_code == 201
  assert updated.status_code == 200
  assert updated.json()['validationStatus'] == 'NOT_VALIDATED'
  assert validated.json()['validationStatus'] == 'VALID'
  assert activated.json()['status'] == 'ACTIVE'
  assert changes.json()['count'] >= 4

  second_draft = client.post(
    f'/api/configuration/mappings/{draft_id}/clone-draft',
    headers=auth_headers(),
    json={'changeNote': 'Temporary draft'},
  )
  abandoned = client.post(
    f"/api/configuration/mappings/{second_draft.json()['id']}/abandon",
    headers=auth_headers(),
  )
  assert abandoned.json()['status'] == 'ABANDONED'


class FakeConfigurationRepository:
  def __init__(self) -> None:
    self.now = datetime(2026, 9, 23, 15, tzinfo=UTC)
    self.partner_id = UUID('00000000-0000-0000-0000-0000000000a1')
    self.mapping_id = UUID('40000000-0000-0000-0000-000000000001')
    self.capability_id = UUID('50000000-0000-0000-0000-000000000001')
    self.capability = {
      'id': self.capability_id,
      'partner_id': self.partner_id,
      'direction': 'INBOUND',
      'document_type': 'APEX_LOAD_TENDER',
      'transport': 'REST',
      'message_format': 'JSON',
      'protocol_version': 'v1',
      'enabled': True,
      'created_at': self.now,
      'updated_at': self.now,
    }
    self.partner = {
      'id': self.partner_id,
      'partner_code': 'APEX',
      'name': 'Apex Logistics',
      'business_role': 'BROKER_3PL',
      'integration_style': 'REST_JSON',
      'active': True,
      'description': 'Apex broker simulator.',
      'support_contact': None,
      'config_revision': 1,
      'capabilities_enabled': 1,
      'capabilities_total': 1,
      'created_at': self.now,
      'updated_at': self.now,
    }
    self.mapping = self._mapping(self.mapping_id, status='ACTIVE', version=1)
    self.mappings = {self.mapping_id: self.mapping}
    self.changes = []

  def list_partners(self):
    return [self.partner]

  def get_partner(self, partner_code):
    if partner_code != 'APEX':
      return None
    return {**self.partner, 'capabilities': [self.capability]}

  def update_partner(self, partner_code, updates, *, note=None):
    if partner_code != 'APEX':
      return None
    self.partner.update(updates)
    self.partner['config_revision'] += 1
    self.changes.append({'action': 'UPDATE'})
    return self.get_partner(partner_code)

  def list_capabilities(self, partner_code):
    return [self.capability] if partner_code == 'APEX' else []

  def update_capability(self, capability_id, *, enabled, note=None):
    if capability_id != self.capability_id:
      return None
    self.capability['enabled'] = enabled
    self.changes.append({'action': 'CAPABILITY_DISABLE' if not enabled else 'CAPABILITY_ENABLE'})
    return self.capability

  def list_mappings(self, **filters):
    rows = [
      mapping for mapping in self.mappings.values()
      if filters.get('status') in (None, mapping['status'])
    ]
    return {'limit': filters.get('limit', 50), 'offset': filters.get('offset', 0), 'count': len(rows), 'mappings': rows}

  def get_mapping(self, mapping_id):
    mapping = self.mappings.get(mapping_id)
    if mapping is None:
      return None
    versions = [
      {**item, 'rules': [], 'versions': []}
      for item in self.mappings.values()
      if item['mapping_key'] == mapping['mapping_key']
    ]
    return {**mapping, 'versions': versions}

  def clone_draft(self, mapping_id, *, change_note=None):
    source = self.mappings.get(mapping_id)
    if source is None:
      return None
    draft_id = uuid4()
    draft = self._mapping(
      draft_id,
      status='DRAFT',
      version=max(item['version_number'] for item in self.mappings.values()) + 1,
      based_on_profile_id=mapping_id,
      change_note=change_note,
    )
    self.mappings[draft_id] = draft
    self.changes.append(self._change(draft_id, 'CREATE_DRAFT'))
    return self.get_mapping(draft_id)

  def update_draft(self, mapping_id, updates):
    mapping = self.mappings.get(mapping_id)
    if mapping is None:
      return None
    mapping.update(updates)
    if 'settings' in updates:
      mapping['validation_status'] = 'NOT_VALIDATED'
    self.changes.append(self._change(mapping_id, 'UPDATE'))
    return self.get_mapping(mapping_id)

  def update_rule(self, mapping_id, rule_id, updates):
    mapping = self.mappings.get(mapping_id)
    if mapping is None:
      return None
    rule = mapping['rules'][0]
    if rule['id'] != rule_id:
      return None
    rule.update(updates)
    return rule

  def validate_draft(self, mapping_id):
    mapping = self.mappings[mapping_id]
    mapping['validation_status'] = 'VALID'
    mapping['validation_errors'] = []
    self.changes.append(self._change(mapping_id, 'VALIDATE'))
    return self.get_mapping(mapping_id)

  def activate_draft(self, mapping_id):
    for mapping in self.mappings.values():
      if mapping['mapping_key'] == self.mappings[mapping_id]['mapping_key'] and mapping['status'] == 'ACTIVE':
        mapping['status'] = 'ARCHIVED'
    self.mappings[mapping_id]['status'] = 'ACTIVE'
    self.changes.append(self._change(mapping_id, 'ACTIVATE'))
    return self.get_mapping(mapping_id)

  def abandon_draft(self, mapping_id):
    self.mappings[mapping_id]['status'] = 'ABANDONED'
    self.changes.append(self._change(mapping_id, 'ABANDON'))
    return self.get_mapping(mapping_id)

  def list_changes(self, **filters):
    rows = [change for change in self.changes if filters.get('entity_type') in (None, change['entity_type'])]
    return {'limit': filters.get('limit', 50), 'offset': filters.get('offset', 0), 'count': len(rows), 'changes': rows}

  def _mapping(self, mapping_id, *, status, version, based_on_profile_id=None, change_note=None):
    return {
      'id': mapping_id,
      'partner_id': self.partner_id,
      'partner_code': 'MWCX',
      'partner_name': 'Midwest Carrier',
      'mapping_key': 'MWCX_990_TO_CANONICAL',
      'name': 'Midwest 990 to canonical',
      'description': 'Inbound tender response mapping.',
      'direction': 'INBOUND',
      'source_format': 'X12',
      'target_format': 'CANONICAL',
      'source_document_type': '990',
      'target_document_type': 'CANONICAL_TENDER_RESPONSE',
      'version_number': version,
      'status': status,
      'settings': {'expectedSender': 'MWCX'},
      'validation_status': 'VALID',
      'validation_errors': [],
      'based_on_profile_id': based_on_profile_id,
      'change_note': change_note,
      'created_at': self.now,
      'updated_at': self.now,
      'validated_at': self.now,
      'activated_at': self.now if status == 'ACTIVE' else None,
      'rules': [{
        'id': UUID('60000000-0000-0000-0000-000000000001'),
        'mapping_profile_id': mapping_id,
        'sequence': 10,
        'rule_key': 'profile',
        'source_path': 'ISA/GS/ST',
        'target_path': 'profile validation',
        'transformation': 'expected sender/receiver',
        'required': True,
        'qualifier_or_condition': None,
        'failure_code': 'INVALID_PARTNER_PROFILE',
        'configuration': {},
        'notes': 'Profile validation.',
        'created_at': self.now,
        'updated_at': self.now,
      }],
      'versions': [],
    }

  def _change(self, entity_id, action):
    return {
      'id': uuid4(),
      'entity_type': 'MAPPING_PROFILE',
      'entity_id': entity_id,
      'action': action,
      'before_snapshot': None,
      'after_snapshot': {},
      'note': None,
      'source': 'ANALYST_CONSOLE',
      'created_at': self.now,
    }
