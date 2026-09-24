from uuid import UUID

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.models.configuration import validate_mapping_settings


class ConfigurationNotFoundError(Exception):
  pass


class ConfigurationConflictError(Exception):
  def __init__(self, code: str, message: str) -> None:
    self.code = code
    self.message = message
    super().__init__(message)


class ActiveMappingNotFoundError(Exception):
  def __init__(self, mapping_key: str) -> None:
    self.mapping_key = mapping_key
    super().__init__(mapping_key)


class InvalidMappingConfigurationError(Exception):
  def __init__(self, mapping_key: str, errors: list[dict[str, object]]) -> None:
    self.mapping_key = mapping_key
    self.errors = errors
    super().__init__(mapping_key)


class IntegrationConfigurationRepository:
  def __init__(self, connection: Connection):
    self.connection = connection

  def list_partners(self) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            p.id, p.partner_code, p.name, p.business_role, p.integration_style,
            p.active, p.description, p.support_contact, p.config_revision,
            p.created_at, p.updated_at,
            count(c.id)::int as capabilities_total,
            count(c.id) filter (where c.enabled)::int as capabilities_enabled
          FROM trading_partners p
          LEFT JOIN trading_partner_capabilities c ON c.partner_id = p.id
          GROUP BY p.id
          ORDER BY p.partner_code
        """
      )
      return [dict(row) for row in cursor.fetchall()]

  def get_partner(self, partner_code: str) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT
            p.id, p.partner_code, p.name, p.business_role, p.integration_style,
            p.active, p.description, p.support_contact, p.config_revision,
            p.created_at, p.updated_at,
            count(c.id)::int as capabilities_total,
            count(c.id) filter (where c.enabled)::int as capabilities_enabled
          FROM trading_partners p
          LEFT JOIN trading_partner_capabilities c ON c.partner_id = p.id
          WHERE p.partner_code = %s
          GROUP BY p.id
        """,
        (partner_code,),
      )
      partner = cursor.fetchone()
      if partner is None:
        return None
      result = dict(partner)
      result['capabilities'] = self.list_capabilities(partner_code)
      return result

  def update_partner(self, partner_code: str, updates: dict[str, object], *, note: str | None = None) -> dict[str, object] | None:
    allowed = {'name', 'description', 'support_contact', 'active'}
    rejected = set(updates) - allowed
    if rejected:
      raise ConfigurationConflictError('UNSUPPORTED_PARTNER_FIELD', 'Partner field is read-only or unsupported.')
    current = self.get_partner(partner_code)
    if current is None:
      return None
    if not updates:
      return current
    assignments = [f'{key} = %s' for key in updates]
    params = list(updates.values())
    params.append(partner_code)
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          f"""
            UPDATE trading_partners
            SET {', '.join(assignments)},
                config_revision = config_revision + 1,
                updated_at = now()
            WHERE partner_code = %s
            RETURNING *
          """,
          tuple(params),
        )
        row = dict(cursor.fetchone())
      updated = self.get_partner(partner_code) or row
      self._write_change(
        entity_type='TRADING_PARTNER',
        entity_id=current['id'],
        action='UPDATE',
        before=current,
        after=updated,
        note=note,
      )
      return updated

  def list_capabilities(self, partner_code: str) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT c.*
          FROM trading_partner_capabilities c
          JOIN trading_partners p ON p.id = c.partner_id
          WHERE p.partner_code = %s
          ORDER BY c.direction, c.document_type
        """,
        (partner_code,),
      )
      return [dict(row) for row in cursor.fetchall()]

  def update_capability(self, capability_id: UUID, *, enabled: bool, note: str | None = None) -> dict[str, object] | None:
    current = self._fetch_capability(capability_id)
    if current is None:
      return None
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            UPDATE trading_partner_capabilities
            SET enabled = %s,
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          (enabled, capability_id),
        )
        updated = dict(cursor.fetchone())
      self._write_change(
        entity_type='PARTNER_CAPABILITY',
        entity_id=capability_id,
        action='CAPABILITY_ENABLE' if enabled else 'CAPABILITY_DISABLE',
        before=current,
        after=updated,
        note=note,
      )
      return updated

  def check_capability_enabled(
    self,
    *,
    partner_code: str,
    direction: str,
    document_type: str,
    transport: str,
    message_format: str,
    protocol_version: str | None = None,
  ) -> bool:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT c.enabled
          FROM trading_partner_capabilities c
          JOIN trading_partners p ON p.id = c.partner_id
          WHERE p.partner_code = %s
            AND c.direction = %s
            AND c.document_type = %s
            AND c.transport = %s
            AND c.message_format = %s
            AND coalesce(c.protocol_version, '') = coalesce(%s, '')
        """,
        (partner_code, direction, document_type, transport, message_format, protocol_version),
      )
      row = cursor.fetchone()
      return bool(row and row['enabled'])

  def list_mappings(
    self,
    *,
    partner_code: str | None = None,
    mapping_key: str | None = None,
    direction: str | None = None,
    status: str | None = None,
    document_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
  ) -> dict[str, object]:
    filters = {
      'p.partner_code': partner_code,
      'mp.mapping_key': mapping_key,
      'mp.direction': direction,
      'mp.status': status,
    }
    clauses = []
    params: list[object] = []
    for column, value in filters.items():
      if value is not None:
        clauses.append(f'{column} = %s')
        params.append(value)
    if document_type is not None:
      clauses.append('(mp.source_document_type = %s OR mp.target_document_type = %s)')
      params.extend([document_type, document_type])
    where_sql = 'WHERE ' + ' AND '.join(clauses) if clauses else ''
    params.extend([limit, offset])
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        f"""
          SELECT mp.*, p.partner_code, p.name as partner_name
          FROM mapping_profiles mp
          JOIN trading_partners p ON p.id = mp.partner_id
          {where_sql}
          ORDER BY mp.mapping_key, mp.version_number desc
          LIMIT %s OFFSET %s
        """,
        tuple(params),
      )
      rows = [dict(row) for row in cursor.fetchall()]
    return {'limit': limit, 'offset': offset, 'count': len(rows), 'mappings': rows}

  def get_mapping(self, mapping_id: UUID) -> dict[str, object] | None:
    profile = self._fetch_mapping(mapping_id)
    if profile is None:
      return None
    profile['rules'] = self._fetch_rules(mapping_id)
    profile['versions'] = self._fetch_versions(profile['mapping_key'])
    return profile

  def get_active_mapping(self, mapping_key: str) -> dict[str, object]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT mp.*, p.partner_code, p.name as partner_name
          FROM mapping_profiles mp
          JOIN trading_partners p ON p.id = mp.partner_id
          WHERE mp.mapping_key = %s
            AND mp.status = 'ACTIVE'
          LIMIT 1
        """,
        (mapping_key,),
      )
      row = cursor.fetchone()
    if row is None:
      raise ActiveMappingNotFoundError(mapping_key)
    profile = dict(row)
    validation = validate_mapping_settings(mapping_key, profile['settings'])
    if validation.status != 'VALID':
      raise InvalidMappingConfigurationError(mapping_key, validation.errors)
    return profile

  def clone_draft(self, mapping_id: UUID, *, change_note: str | None = None) -> dict[str, object] | None:
    source = self._fetch_mapping(mapping_id)
    if source is None:
      return None
    if source['status'] != 'ACTIVE':
      raise ConfigurationConflictError('SOURCE_MAPPING_NOT_ACTIVE', 'Only ACTIVE mappings can be cloned to draft.')
    rules = self._fetch_rules(mapping_id)
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          'SELECT coalesce(max(version_number), 0) + 1 as next_version FROM mapping_profiles WHERE mapping_key = %s',
          (source['mapping_key'],),
        )
        next_version = cursor.fetchone()['next_version']
        cursor.execute(
          """
            INSERT INTO mapping_profiles (
              partner_id, mapping_key, name, description, direction, source_format,
              target_format, source_document_type, target_document_type, version_number,
              status, settings, validation_status, validation_errors, based_on_profile_id, change_note
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DRAFT', %s, 'NOT_VALIDATED', '[]', %s, %s)
            RETURNING id
          """,
          (
            source['partner_id'],
            source['mapping_key'],
            source['name'],
            source['description'],
            source['direction'],
            source['source_format'],
            source['target_format'],
            source['source_document_type'],
            source['target_document_type'],
            next_version,
            Jsonb(source['settings']),
            source['id'],
            change_note,
          ),
        )
        draft_id = cursor.fetchone()['id']
        for rule in rules:
          cursor.execute(
            """
              INSERT INTO mapping_rules (
                mapping_profile_id, sequence, rule_key, source_path, target_path,
                transformation, required, qualifier_or_condition, failure_code,
                configuration, notes
              )
              VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
              draft_id,
              rule['sequence'],
              rule['rule_key'],
              rule['source_path'],
              rule['target_path'],
              rule['transformation'],
              rule['required'],
              rule['qualifier_or_condition'],
              rule['failure_code'],
              Jsonb(rule['configuration']),
              rule['notes'],
            ),
          )
      draft = self.get_mapping(draft_id)
      self._write_change(
        entity_type='MAPPING_PROFILE',
        entity_id=draft_id,
        action='CREATE_DRAFT',
        before=source,
        after=draft,
        note=change_note,
      )
      return draft

  def update_draft(self, mapping_id: UUID, updates: dict[str, object]) -> dict[str, object] | None:
    current = self._fetch_mapping(mapping_id)
    if current is None:
      return None
    if current['status'] != 'DRAFT':
      raise ConfigurationConflictError('ACTIVE_MAPPING_IMMUTABLE', 'Only DRAFT mappings can be edited.')
    allowed = {'name', 'description', 'change_note', 'settings'}
    if set(updates) - allowed:
      raise ConfigurationConflictError('UNSUPPORTED_MAPPING_FIELD', 'Mapping field is read-only or unsupported.')
    if not updates:
      return self.get_mapping(mapping_id)
    assignments = []
    params: list[object] = []
    for key, value in updates.items():
      assignments.append(f'{key} = %s')
      params.append(Jsonb(value) if key == 'settings' else value)
    params.append(mapping_id)
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          f"""
            UPDATE mapping_profiles
            SET {', '.join(assignments)},
                validation_status = CASE WHEN %s THEN 'NOT_VALIDATED' ELSE validation_status END,
                validation_errors = CASE WHEN %s THEN '[]'::jsonb ELSE validation_errors END,
                validated_at = CASE WHEN %s THEN null ELSE validated_at END,
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          tuple(params[:-1] + ['settings' in updates, 'settings' in updates, 'settings' in updates, mapping_id]),
        )
        updated_row = dict(cursor.fetchone())
      updated = self.get_mapping(mapping_id) or updated_row
      self._write_change('MAPPING_PROFILE', mapping_id, 'UPDATE', current, updated, note=updates.get('change_note'))
      return updated

  def update_rule(self, mapping_id: UUID, rule_id: UUID, updates: dict[str, object]) -> dict[str, object] | None:
    profile = self._fetch_mapping(mapping_id)
    if profile is None:
      return None
    if profile['status'] != 'DRAFT':
      raise ConfigurationConflictError('ACTIVE_MAPPING_IMMUTABLE', 'Only DRAFT mapping rules can be edited.')
    current = self._fetch_rule(rule_id)
    if current is None or current['mapping_profile_id'] != mapping_id:
      return None
    allowed = {'configuration', 'notes'}
    if set(updates) - allowed:
      raise ConfigurationConflictError('UNSUPPORTED_RULE_FIELD', 'Mapping rule field is read-only or unsupported.')
    if not updates:
      return current
    assignments = []
    params: list[object] = []
    for key, value in updates.items():
      assignments.append(f'{key} = %s')
      params.append(Jsonb(value) if key == 'configuration' else value)
    params.extend([rule_id])
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          f"""
            UPDATE mapping_rules
            SET {', '.join(assignments)}, updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          tuple(params),
        )
        updated = dict(cursor.fetchone())
        cursor.execute(
          """
            UPDATE mapping_profiles
            SET validation_status = 'NOT_VALIDATED',
                validation_errors = '[]'::jsonb,
                validated_at = null,
                updated_at = now()
            WHERE id = %s
          """,
          (mapping_id,),
        )
      self._write_change('MAPPING_RULE', rule_id, 'UPDATE', current, updated, note=updates.get('notes'))
      return updated

  def validate_draft(self, mapping_id: UUID) -> dict[str, object] | None:
    profile = self._fetch_mapping(mapping_id)
    if profile is None:
      return None
    if profile['status'] != 'DRAFT':
      raise ConfigurationConflictError('MAPPING_NOT_DRAFT', 'Only DRAFT mappings can be validated.')
    validation = validate_mapping_settings(profile['mapping_key'], profile['settings'])
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            UPDATE mapping_profiles
            SET validation_status = %s,
                validation_errors = %s,
                validated_at = now(),
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          (validation.status, Jsonb(validation.errors), mapping_id),
        )
        updated = dict(cursor.fetchone())
      self._write_change('MAPPING_PROFILE', mapping_id, 'VALIDATE', profile, updated, note=profile.get('change_note'))
    return self.get_mapping(mapping_id)

  def activate_draft(self, mapping_id: UUID) -> dict[str, object] | None:
    draft = self._fetch_mapping(mapping_id)
    if draft is None:
      return None
    if draft['status'] != 'DRAFT':
      raise ConfigurationConflictError('MAPPING_NOT_DRAFT', 'Only DRAFT mappings can be activated.')
    if draft['validation_status'] != 'VALID':
      raise ConfigurationConflictError('MAPPING_NOT_VALID', 'Only VALID drafts can be activated.')
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            UPDATE mapping_profiles
            SET status = 'ARCHIVED',
                updated_at = now()
            WHERE mapping_key = %s
              AND status = 'ACTIVE'
            RETURNING *
          """,
          (draft['mapping_key'],),
        )
        archived = [dict(row) for row in cursor.fetchall()]
        cursor.execute(
          """
            UPDATE mapping_profiles
            SET status = 'ACTIVE',
                activated_at = now(),
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          (mapping_id,),
        )
        active = dict(cursor.fetchone())
      for archived_profile in archived:
        self._write_change('MAPPING_PROFILE', archived_profile['id'], 'ARCHIVE', archived_profile, {**archived_profile, 'status': 'ARCHIVED'})
      self._write_change('MAPPING_PROFILE', mapping_id, 'ACTIVATE', draft, active, note=draft.get('change_note'))
      return self.get_mapping(mapping_id)

  def abandon_draft(self, mapping_id: UUID) -> dict[str, object] | None:
    draft = self._fetch_mapping(mapping_id)
    if draft is None:
      return None
    if draft['status'] != 'DRAFT':
      raise ConfigurationConflictError('MAPPING_NOT_DRAFT', 'Only DRAFT mappings can be abandoned.')
    with self.connection.transaction():
      with self.connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
          """
            UPDATE mapping_profiles
            SET status = 'ABANDONED',
                updated_at = now()
            WHERE id = %s
            RETURNING *
          """,
          (mapping_id,),
        )
        updated = dict(cursor.fetchone())
      self._write_change('MAPPING_PROFILE', mapping_id, 'ABANDON', draft, updated, note=draft.get('change_note'))
      return self.get_mapping(mapping_id)

  def list_changes(
    self,
    *,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
  ) -> dict[str, object]:
    clauses = []
    params: list[object] = []
    if entity_type is not None:
      clauses.append('entity_type = %s')
      params.append(entity_type)
    if entity_id is not None:
      clauses.append('entity_id = %s')
      params.append(entity_id)
    where_sql = 'WHERE ' + ' AND '.join(clauses) if clauses else ''
    params.extend([limit, offset])
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        f"""
          SELECT *
          FROM configuration_change_log
          {where_sql}
          ORDER BY created_at desc, id desc
          LIMIT %s OFFSET %s
        """,
        tuple(params),
      )
      rows = [dict(row) for row in cursor.fetchall()]
    return {'limit': limit, 'offset': offset, 'count': len(rows), 'changes': rows}

  def _fetch_capability(self, capability_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute('SELECT * FROM trading_partner_capabilities WHERE id = %s', (capability_id,))
      row = cursor.fetchone()
    return dict(row) if row else None

  def _fetch_mapping(self, mapping_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT mp.*, p.partner_code, p.name as partner_name
          FROM mapping_profiles mp
          JOIN trading_partners p ON p.id = mp.partner_id
          WHERE mp.id = %s
        """,
        (mapping_id,),
      )
      row = cursor.fetchone()
    return dict(row) if row else None

  def _fetch_rules(self, mapping_id: UUID) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        'SELECT * FROM mapping_rules WHERE mapping_profile_id = %s ORDER BY sequence, rule_key',
        (mapping_id,),
      )
      return [dict(row) for row in cursor.fetchall()]

  def _fetch_rule(self, rule_id: UUID) -> dict[str, object] | None:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute('SELECT * FROM mapping_rules WHERE id = %s', (rule_id,))
      row = cursor.fetchone()
    return dict(row) if row else None

  def _fetch_versions(self, mapping_key: str) -> list[dict[str, object]]:
    with self.connection.cursor(row_factory=dict_row) as cursor:
      cursor.execute(
        """
          SELECT mp.*, p.partner_code, p.name as partner_name
          FROM mapping_profiles mp
          JOIN trading_partners p ON p.id = mp.partner_id
          WHERE mp.mapping_key = %s
          ORDER BY mp.version_number desc
        """,
        (mapping_key,),
      )
      return [{**dict(row), 'rules': [], 'versions': []} for row in cursor.fetchall()]

  def _write_change(
    self,
    entity_type: str,
    entity_id: UUID,
    action: str,
    before: dict[str, object] | None = None,
    after: dict[str, object] | None = None,
    note: object | None = None,
  ) -> None:
    with self.connection.cursor() as cursor:
      cursor.execute(
        """
          INSERT INTO configuration_change_log (
            entity_type,
            entity_id,
            action,
            before_snapshot,
            after_snapshot,
            note
          )
          VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
          entity_type,
          entity_id,
          action,
          Jsonb(_json_safe(before)) if before is not None else None,
          Jsonb(_json_safe(after)) if after is not None else None,
          str(note) if note else None,
        ),
      )


def _json_safe(value: object) -> object:
  if isinstance(value, UUID):
    return str(value)
  if isinstance(value, dict):
    return {key: _json_safe(item) for key, item in value.items()}
  if isinstance(value, list):
    return [_json_safe(item) for item in value]
  if hasattr(value, 'isoformat'):
    return value.isoformat()
  return value
