import type { TrainingExport } from './trainingExport'

export const END_OF_WEEK_CHECK_IN_VERSION = '1.0.0' as const

export const END_OF_WEEK_CHECK_IN_QUESTIONS = [
  {
    id: 'availability_next_week',
    question:
      'What does your availability look like next week? Include work, travel, shortened sessions, missed days or any schedule changes.',
    answer_format: 'free_text',
  },
  {
    id: 'last_week_overall',
    question:
      'How did the training week feel overall? Tell me if it felt about right, too much, undercooked, or if any muscles or sessions stood out.',
    answer_format: 'free_text',
  },
  {
    id: 'desired_training_demand',
    question: 'How hard do you want next week to be?',
    answer_format: 'one_of',
    options: ['Recovery', 'Normal', 'Hard', 'FREAK MODE'],
  },
  {
    id: 'next_week_preferences',
    question:
      'What do you want more or less of next week? Include muscle volume or intensity, more exercise/movement variety, and any movements you particularly want kept, rotated or avoided.',
    answer_format: 'free_text',
  },
  {
    id: 'other_context',
    question: 'Anything else I should know before programming next week?',
    answer_format: 'free_text',
  },
] as const

export function with_end_of_week_check_in(payload: TrainingExport) {
  return {
    ...payload,
    sessions: payload.sessions.map((session) => ({
      ...session,
      post_workout_feedback: session.readiness
        ? {
            session_quality: session.readiness.session_quality ?? null,
            session_fatigue: session.readiness.session_fatigue,
            energy_stability: session.readiness.energy_stability,
            breathlessness: session.readiness.breathlessness,
            coach_note: session.readiness.coach_note ?? null,
          }
        : null,
    })),
    coach_instructions: {
      ...payload.coach_instructions,
      post_workout_feedback_rule:
        'Review each session.post_workout_feedback alongside the objective sets, exercise metrics and readiness data. Treat session quality, fatigue, energy stability, breathlessness and the user coach note as subjective evidence that can explain performance and influence next-week programming.',
      end_of_week_check_in: {
        version: END_OF_WEEK_CHECK_IN_VERSION,
        required_before_programming: true,
        interaction_rule:
          'When the user asks to build next week, ask all five end-of-week questions together in your first response and wait for the user to answer them. Do not create, draft or return next week\'s programme or programme-import JSON in that same response. Only skip this gate if the user explicitly tells you to skip the check-in.',
        programming_rule:
          'Use the answers as current user intent alongside the supplied training evidence. Availability is a hard scheduling constraint. Recovery and performance evidence can override a request for more training stress when warranted. Exercise-variety requests should rotate suitable secondary movements while retaining proven anchor exercises unless the evidence or user preference supports changing them.',
        questions: END_OF_WEEK_CHECK_IN_QUESTIONS,
      },
    },
  }
}
