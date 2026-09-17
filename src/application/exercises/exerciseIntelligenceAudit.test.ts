import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import { classify_exercise_intelligence } from './exerciseIntelligence'
import { classify_known_legacy_exercise } from './exerciseIntelligenceLegacy'
import { inspect_exercise_intelligence } from './exerciseIntelligenceAudit'
import { audit_exercise_library } from './exerciseLibraryAudit'
import { confirm_exercise_intelligence } from './exerciseIntelligenceReview'
import { TRIDENT_CATALOGUE } from '../gyms/tridentCatalogue'
import { cleanup_exercise_intelligence } from './exerciseIntelligenceCleanup'

function exercise(name = 'Wide Grip Lat Pulldown', id = 'exercise-1'): Exercise {
  return { id, canonical_name: name, short_name: null, category: null, equipment: null,
    default_load_type: 'normal', rep_mode_default: 'total', archived_at: null, notes: 'keep setup',
    created_at: '2026-09-17T10:00:00.000Z', updated_at: '2026-09-17T10:00:00.000Z',
    deleted_at: null, revision: 1, device_id: 'device', source_kind: 'user', source_id: null }
}
function enriched(name?: string, id?: string): Exercise {
  const item = exercise(name, id)
  item.exercise_intelligence = classify_known_legacy_exercise(item) ?? classify_exercise_intelligence(item)
  return item
}
function repository(seed: Exercise[]): { repo: ExerciseRepository; records: Exercise[]; writes: Exercise[] } {
  const records = structuredClone(seed)
  const writes: Exercise[] = []
  return { records, writes, repo: {
    get_by_id: async (id) => records.find((item) => item.id === id),
    list_all: async () => records, list_active: async () => records.filter((item) => !item.archived_at && !item.deleted_at),
    list_aliases: async () => [], merge_definitions: async () => { throw new Error('Audit must never merge IDs') },
    put: async (item) => { records[records.findIndex((other) => other.id === item.id)] = item; writes.push(item); return item.id },
  } }
}

describe('final exercise intelligence validation', () => {
  it('cleans duplicate automatic muscle roles once, preserving IDs and all other fields', async () => {
    const item = enriched('Face Pull')
    item.exercise_intelligence!.primary_muscles = ['Posterior deltoid', 'Trapezius - mid/lower']
    item.exercise_intelligence!.secondary_muscles = ['Rhomboids', 'Trapezius - mid/lower']
    const fixture = repository([item])
    expect(await cleanup_exercise_intelligence(fixture.repo, '2026-09-17T17:00:00.000Z')).toBe(1)
    expect(fixture.records[0]).toEqual({ ...item, revision: item.revision + 1,
      updated_at: '2026-09-17T17:00:00.000Z', exercise_intelligence: {
        ...item.exercise_intelligence!, secondary_muscles: ['Rhomboids'],
      } })
    expect(await cleanup_exercise_intelligence(fixture.repo)).toBe(0)
    expect(fixture.writes).toHaveLength(1)
  })

  it.each(['verified', 'user_confirmed', 'needs_review'] as const)('leaves %s muscle roles untouched', async (status) => {
    const item = enriched('Face Pull')
    item.exercise_intelligence!.metadata_status = status
    item.exercise_intelligence!.secondary_muscles = [...item.exercise_intelligence!.primary_muscles]
    const fixture = repository([item])
    expect(await cleanup_exercise_intelligence(fixture.repo)).toBe(0)
    expect(fixture.records).toEqual([item])
  })
  it('finds missing and malformed data, placeholders and contradictory roles even when confirmed', () => {
    const bad = enriched()
    bad.exercise_intelligence = { ...bad.exercise_intelligence!, metadata_status: 'user_confirmed', metadata_confidence: 1,
      movement_pattern: 'Needs classification', exercise_family: 'Unclassified',
      primary_muscles: ['Lats', 'lats'], secondary_muscles: ['LATS'] }
    const broken = exercise('Broken', 'broken')
    broken.exercise_intelligence = { primary_muscles: 'Lats' } as unknown as ExerciseIntelligence
    const source = [exercise('Missing', 'missing'), bad, broken]
    const before = structuredClone(source)
    const result = inspect_exercise_intelligence(source)
    expect(new Set(result.findings.map((finding) => finding.code))).toEqual(new Set([
      'missing_metadata', 'invalid_metadata', 'unresolved_classification', 'duplicate_muscle', 'muscle_role_overlap',
    ]))
    expect(source).toEqual(before)
  })

  it('preserves valid confirmations and ignores old fallback provenance after correction', async () => {
    const item = enriched('Lat Pulldown')
    item.exercise_intelligence = { ...item.exercise_intelligence!, metadata_status: 'user_confirmed', metadata_confidence: 1,
      metadata_sources: ['PF category fallback — manual review required', 'PF user-confirmed exercise intelligence'] }
    const fixture = repository([item])
    expect((await audit_exercise_library(fixture.repo)).status).toBe('clean')
    expect(fixture.writes).toHaveLength(0)
    expect(fixture.records).toEqual([item])
  })

  it('does not rewrite ambiguous or exact legacy records on repeated audits', async () => {
    const fixture = repository([exercise('Lat Pulldown'), exercise('ISO Lat Row', 'iso')])
    await audit_exercise_library(fixture.repo)
    const first = structuredClone(fixture.records)
    const count = fixture.writes.length
    await audit_exercise_library(fixture.repo)
    expect(fixture.writes).toHaveLength(count)
    expect(fixture.records).toEqual(first)
    expect(first[0].exercise_intelligence?.metadata_status).toBe('needs_review')
    expect(first[1].exercise_intelligence?.exercise_family).toBe('Lat-biased row')
    expect(first.map((item) => item.id)).toEqual(['exercise-1', 'iso'])
    expect(first.every((item) => item.notes === 'keep setup')).toBe(true)
  })

  it('does not mutate malformed, archived, deleted or user-confirmed metadata', async () => {
    const malformed = enriched()
    malformed.exercise_intelligence = { metadata_status: 'user_confirmed' } as ExerciseIntelligence
    const archived = { ...exercise('Lat Pulldown', 'archived'), archived_at: '2026-09-16' }
    const deleted = { ...exercise('Lat Pulldown', 'deleted'), deleted_at: '2026-09-16' }
    const fixture = repository([malformed, archived, deleted])
    expect((await audit_exercise_library(fixture.repo)).status).toBe('warning')
    expect(fixture.writes).toHaveLength(0)
    expect(fixture.records).toEqual([malformed, archived, deleted])
  })

  it('finds exact duplicate names and inconsistent metadata without merging distinct gym machines', () => {
    const first = enriched()
    const second = enriched(undefined, 'duplicate')
    second.exercise_intelligence = { ...second.exercise_intelligence!, exercise_family: 'Row' }
    const different = { ...enriched(undefined, 'other-gym'), origin_gym_profile_id: 'other' }
    const result = inspect_exercise_intelligence([first, second, different])
    expect(result.findings.filter((finding) => finding.code === 'duplicate_candidate')).toHaveLength(2)
    expect(result.findings.some((finding) => finding.code === 'inconsistent_duplicate')).toBe(true)
    expect(result.findings.some((finding) => finding.exercise_id === 'other-gym')).toBe(false)
  })

  it('reports malformed duplicate metadata without crashing or treating it as complete', () => {
    const first = enriched()
    const second = enriched(undefined, 'duplicate')
    second.exercise_intelligence = { exercise_family: 42 } as unknown as ExerciseIntelligence
    expect(inspect_exercise_intelligence([first, second]).findings.some((finding) => finding.code === 'invalid_metadata')).toBe(true)
  })

  it.each([Number.NaN, Infinity, -1, 1.1, 0.5])('flags invalid or inconsistent confidence %s', (confidence) => {
    const item = enriched()
    item.exercise_intelligence!.metadata_confidence = confidence
    expect(inspect_exercise_intelligence([item]).status).toBe('warning')
  })

  it.each(['movement_pattern', 'exercise_family', 'muscle_length_bias'] as const)('rejects confirming unresolved %s without writing', async (field) => {
    const item = enriched()
    const fixture = repository([item])
    const draft = { ...item.exercise_intelligence!, [field]: field === 'muscle_length_bias' ? 'unknown' : 'Needs classification' } as ExerciseIntelligence
    await expect(confirm_exercise_intelligence(fixture.repo, item.id, draft, 'device')).rejects.toThrow('still needs classification')
    expect(fixture.writes).toHaveLength(0)
  })

  it('normalises repeated muscle labels on explicit confirmation without changing identity', async () => {
    const item = enriched()
    const fixture = repository([item])
    const confirmed = await confirm_exercise_intelligence(fixture.repo, item.id, {
      ...item.exercise_intelligence!, primary_muscles: [' Lats ', 'lats'], secondary_muscles: ['LATS', 'Biceps'],
      stabilizer_muscles: ['biceps', 'Abs', 'abs'],
    }, 'device')
    expect(confirmed.exercise_intelligence).toMatchObject({ primary_muscles: ['Lats'], secondary_muscles: ['Biceps'], stabilizer_muscles: ['Abs'] })
    expect(confirmed.id).toBe(item.id)
    expect(confirmed.created_at).toBe(item.created_at)
    expect(confirmed.notes).toBe(item.notes)
  })

  it('keeps explicit variants distinct and returns independent metadata objects', () => {
    const wide = enriched('Wide Grip Seated Cable Row')
    const single = enriched('Single Arm Seated Cable Row')
    expect(wide.exercise_intelligence?.grip_or_handle).not.toBe(single.exercise_intelligence?.grip_or_handle)
    expect(single.exercise_intelligence?.laterality).toBe('unilateral')
    wide.exercise_intelligence!.primary_muscles.push('Test mutation')
    expect(enriched('Wide Grip Seated Cable Row').exercise_intelligence?.primary_muscles).not.toContain('Test mutation')
    const legacy = enriched('ISO Lat Row')
    legacy.exercise_intelligence!.primary_muscles.push('Test mutation')
    expect(enriched('ISO Lat Row').exercise_intelligence?.primary_muscles).not.toContain('Test mutation')
    expect(enriched('Narrow Mystery').exercise_intelligence?.exercise_family).not.toBe('Row')
  })

  it('audits every shipped Trident seed and never reports unresolved seeds as clean', () => {
    const seeds = TRIDENT_CATALOGUE.map((seed) => {
      const item = { ...exercise(seed.display_name, seed.id), category: seed.category, equipment: seed.equipment,
        machine_brand: seed.brand, machine_model: seed.model }
      return { ...item, exercise_intelligence: classify_known_legacy_exercise(item) ?? classify_exercise_intelligence(item) }
    })
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(seeds.length)
    const result = inspect_exercise_intelligence(seeds)
    for (const seed of seeds.filter((item) => item.exercise_intelligence.metadata_status === 'needs_review')) {
      expect(result.findings.some((finding) => finding.exercise_id === seed.id)).toBe(true)
    }
    expect(result.findings.filter((finding) => finding.code === 'missing_metadata')).toEqual([])
  })
})
