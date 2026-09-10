import { describe, expect, it } from 'vitest'
import type { TrainingExport } from './trainingExport'
import {
  END_OF_WEEK_CHECK_IN_QUESTIONS,
  with_end_of_week_check_in,
} from './coachBridgeCheckIn'

describe('Coach Bridge end-of-week check-in', () => {
  it('adds the mandatory five-question gate before next-week programming', () => {
    const payload = {
      coach_instructions: {
        purpose: 'test',
      },
    } as unknown as TrainingExport

    const result = with_end_of_week_check_in(payload)
    const check_in = result.coach_instructions.end_of_week_check_in

    expect(check_in.required_before_programming).toBe(true)
    expect(check_in.questions).toHaveLength(5)
    expect(check_in.questions).toEqual(END_OF_WEEK_CHECK_IN_QUESTIONS)
    expect(check_in.interaction_rule).toContain('wait for the user to answer')
    expect(check_in.interaction_rule).toContain('Do not create')

    const demand_question = check_in.questions.find(
      (question) => question.id === 'desired_training_demand',
    )
    expect(demand_question).toMatchObject({
      answer_format: 'one_of',
      options: ['Recovery', 'Normal', 'Hard', 'FREAK MODE'],
    })
  })
})
