import { describe, expect, it, vi } from 'vitest'
import type { ReadinessEntry } from '../../domain/models'
import type { ReadinessRepository } from '../../data/repositories/contracts'
import { save_session_readiness } from './readiness'

const NOW = '2026-09-04T18:45:00.000Z'

function repository_fixture(existing?: ReadinessEntry) {
  let saved: ReadinessEntry | undefined

  const repository: ReadinessRepository = {
    get_by_session_id: async () => existing,
    put: vi.fn(async (entry) => {
      saved = entry
      return entry.id
    }),
  }

  return { repository, saved: () => saved }
}

describe('save_session_readiness', () => {
  it('stores optional readiness values against the completed session', async () => {
    const fixture = repository_fixture()

    const saved = await save_session_readiness(
      {
        completed_session_id: 'session-1',
        bodyweight_kg: 108.4,
        sleep_duration_minutes: 425,
        sleep_score: 82,
        energy_pre: 8,
        motivation_pre: 9,
        soreness_score: 3,
        soreness_notes: 'Mild quads',
        joint_issue_present: false,
        joint_issue_notes: null,
        pre_workout_nutrition: 'Carbs + pre-workout',
        intra_workout_nutrition: 'Cyclic dextrin',
        intra_hydration_ml: 1000,
        notes: 'Gym warm',
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: NOW,
        id_factory: () => 'readiness-1',
      },
    )

    expect(saved).toMatchObject({
      id: 'readiness-1',
      completed_session_id: 'session-1',
      bodyweight_kg: 108.4,
      sleep_duration_minutes: 425,
      sleep_score: 82,
      energy_pre: 8,
      motivation_pre: 9,
      soreness_score: 3,
      joint_issue_present: false,
      intra_hydration_ml: 1000,
      revision: 1,
    })
  })

  it('updates the same readiness record and preserves post-workout fields', async () => {
    const existing: ReadinessEntry = {
      id: 'readiness-1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      revision: 1,
      device_id: 'device-1',
      source_kind: 'user',
      source_id: null,
      completed_session_id: 'session-1',
      bodyweight_kg: 108,
      sleep_duration_minutes: 420,
      sleep_score: 80,
      energy_pre: 7,
      motivation_pre: 8,
      soreness_score: 2,
      soreness_notes: null,
      joint_issue_present: false,
      joint_issue_notes: null,
      pre_workout_nutrition: null,
      intra_workout_nutrition: null,
      intra_hydration_ml: null,
      post_workout_intake: 'Whey isolate',
      session_fatigue: 8,
      breathlessness: 4,
      energy_stability: 9,
      notes: null,
    }
    const fixture = repository_fixture(existing)

    const saved = await save_session_readiness(
      {
        completed_session_id: 'session-1',
        bodyweight_kg: 108.2,
        sleep_duration_minutes: 430,
        sleep_score: 83,
        energy_pre: 8,
        motivation_pre: 9,
        soreness_score: 2,
        soreness_notes: null,
        joint_issue_present: false,
        joint_issue_notes: null,
        pre_workout_nutrition: 'Updated',
        intra_workout_nutrition: null,
        intra_hydration_ml: 750,
        notes: null,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: '2026-09-04T18:46:00.000Z',
      },
    )

    expect(saved.id).toBe(existing.id)
    expect(saved.revision).toBe(2)
    expect(saved.post_workout_intake).toBe('Whey isolate')
    expect(saved.session_fatigue).toBe(8)
  })

  it('rejects impossible readiness scores', async () => {
    const fixture = repository_fixture()

    await expect(
      save_session_readiness(
        {
          completed_session_id: 'session-1',
          bodyweight_kg: 108,
          sleep_duration_minutes: 420,
          sleep_score: 82,
          energy_pre: 11,
          motivation_pre: 8,
          soreness_score: 2,
          soreness_notes: null,
          joint_issue_present: false,
          joint_issue_notes: null,
          pre_workout_nutrition: null,
          intra_workout_nutrition: null,
          intra_hydration_ml: 1000,
          notes: null,
        },
        fixture.repository,
        {
          device_id: 'device-1',
          now_iso: NOW,
        },
      ),
    ).rejects.toThrow('Energy must be between 1 and 10')
  })
})
