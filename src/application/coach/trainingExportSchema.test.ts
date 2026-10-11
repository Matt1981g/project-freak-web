import { describe, expect, it } from 'vitest'
import legacy_schema from '../../../docs/schemas/project-freak-training-export-v1.schema.json'
import current_schema from '../../../docs/schemas/project-freak-training-export-v2.schema.json'
import {
  COACH_INSTRUCTIONS_VERSION,
  TRAINING_EXPORT_FORMAT,
  TRAINING_EXPORT_SCHEMA_VERSION,
} from './trainingExport'

describe('published Coach Bridge schema contract', () => {
  it('separates legacy v1 exports from the current v2 export format', () => {
    expect(legacy_schema.properties.schema_version.const).toBe('1.0.0')
    expect(current_schema.properties.schema_version.const).toBe(
      TRAINING_EXPORT_SCHEMA_VERSION,
    )
    expect(current_schema.properties.format.const).toBe(TRAINING_EXPORT_FORMAT)
    expect(current_schema.properties.coach_instructions.properties.instruction_version.const)
      .toBe(COACH_INSTRUCTIONS_VERSION)
    expect(current_schema.required).toContain('coach_instructions')
    expect(current_schema.properties.coach_context.required).toContain(
      'adaptive_analysis',
    )
    expect(legacy_schema.required).not.toContain('coach_instructions')
  })

  it('retains nullable RPE and enjoyment for historical records', () => {
    for (const schema of [legacy_schema, current_schema]) {
      expect(schema.$defs.set.properties.rpe).toMatchObject({
        type: ['number', 'null'],
        minimum: 1,
        maximum: 10,
      })
      expect(schema.$defs.metrics.properties.enjoyment).toMatchObject({
        type: ['number', 'null'],
        minimum: 1,
        maximum: 10,
      })
    }
  })
})
