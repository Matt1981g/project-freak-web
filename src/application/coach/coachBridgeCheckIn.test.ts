import { describe, expect, it } from 'vitest'
import type { TrainingExport } from './trainingExport'
import {
  END_OF_WEEK_CHECK_IN_QUESTIONS,
  with_end_of_week_check_in,
} from './coachBridgeCheckIn'

function payload(complete: boolean): TrainingExport {
  return {
    coach_instructions: {
      purpose: 'test',
      next_block: {
        availability: {
          week_start_date_local: '2026-10-05',
          week_end_date_local: '2026-10-11',
          complete,
          source: complete ? 'coach_screen' : 'unspecified',
          scheduling_rule: 'Never train on unavailable days.',
          days: {
            monday: {
              date_local: '2026-10-05',
              status: 'available',
              max_minutes: 90,
            },
            tuesday: {
              date_local: '2026-10-06',
              status: complete ? 'unavailable' : 'unspecified',
              max_minutes: null,
            },
            wednesday: {
              date_local: '2026-10-07',
              status: 'available',
              max_minutes: 90,
            },
            thursday: {
              date_local: '2026-10-08',
              status: 'available',
              max_minutes: 90,
            },
            friday: {
              date_local: '2026-10-09',
              status: 'available',
              max_minutes: 90,
            },
            saturday: {
              date_local: '2026-10-10',
              status: 'long_session',
              max_minutes: 120,
            },
            sunday: {
              date_local: '2026-10-11',
              status: 'unavailable',
              max_minutes: null,
            },
          },
        },
      },
    },
    sessions: [],
  } as unknown as TrainingExport
}

describe('Coach Bridge end-of-week check-in', () => {
  it('adds the mandatory five-question gate and confirms saved availability', () => {
    const result = with_end_of_week_check_in(payload(true))
    const check_in = result.coach_instructions.end_of_week_check_in

    expect(check_in.version).toBe('2.0.0')
    expect(check_in.required_before_programming).toBe(true)
    expect(check_in.questions).toHaveLength(5)
    expect(check_in.interaction_rule).toContain('wait for the user to answer')
    expect(check_in.interaction_rule).toContain('Do not create')
    expect(check_in.programming_rule).toContain(
      'dated next_block.availability is a hard scheduling constraint',
    )

    const availability_question = check_in.questions[0]
    expect(availability_question.id).toBe('availability_next_week')
    expect(availability_question.question).toContain(
      'PROJECT FREAK has saved this availability',
    )
    expect(availability_question.question).toContain(
      'monday: available (max 90 min)',
    )

    const demand_question = check_in.questions.find(
      (question) => question.id === 'desired_training_demand',
    )
    expect(demand_question).toMatchObject({
      answer_format: 'one_of',
      options: ['Recovery', 'Normal', 'Hard', 'FREAK MODE'],
    })
  })

  it('asks the user to complete unspecified availability rather than inventing it', () => {
    const result = with_end_of_week_check_in(payload(false))
    const availability_question =
      result.coach_instructions.end_of_week_check_in.questions[0]

    expect(availability_question.question).toContain(
      'does not yet have complete availability',
    )
    expect(availability_question.question).toContain('tuesday: unspecified')
  })

  it('retains the standard five check-in topics after the dynamic availability question', () => {
    const result = with_end_of_week_check_in(payload(true))
    const questions = result.coach_instructions.end_of_week_check_in.questions

    expect(questions.slice(1)).toEqual(END_OF_WEEK_CHECK_IN_QUESTIONS.slice(1))
  })
})
