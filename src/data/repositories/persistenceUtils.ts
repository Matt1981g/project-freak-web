import { create_uuid } from '../../domain/ids/uuid'
import type { AuditEvent, JsonValue, MutableEntity, SyncOutbox } from '../../domain/models'

export function to_json_value(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export function create_audit_event(
  entity_type: string,
  entity: MutableEntity,
  before: unknown | null,
  action: AuditEvent['action'],
): AuditEvent {
  return {
    id: create_uuid(),
    entity_type,
    entity_id: entity.id,
    action,
    before_json: before === null ? null : to_json_value(before),
    after_json: to_json_value(entity),
    reason: null,
    device_id: entity.device_id,
    created_at: new Date().toISOString(),
  }
}

export function create_sync_outbox_entry(
  entity_type: string,
  entity: MutableEntity,
): SyncOutbox {
  return {
    id: create_uuid(),
    entity_type,
    entity_id: entity.id,
    operation: entity.deleted_at === null ? 'upsert' : 'delete',
    revision: entity.revision,
    payload_json: to_json_value(entity),
    created_at: new Date().toISOString(),
    attempt_count: 0,
    last_attempt_at: null,
    synced_at: null,
  }
}
