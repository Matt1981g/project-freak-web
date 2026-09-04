export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type SourceKind =
  | 'user'
  | 'programme_import'
  | 'historical_import'
  | 'restore'
  | 'sync'

export interface MutableEntity {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  revision: number
  device_id: string
  source_kind: SourceKind
  source_id: string | null
}
