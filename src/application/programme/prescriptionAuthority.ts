import type { ProgrammedSessionSet } from '../../domain/models'
import { parse_adaptive_challenge } from './progressionChallenge'

export type PrescriptionAuthority =
  | 'manual'
  | 'adaptive'
  | 'coach_import'
  | 'synced'
  | 'unknown'

export interface PrescriptionAuthorityDecision {
  authority: PrescriptionAuthority
  adaptive_change_allowed: boolean
  reason: string
}

const PF_ADAPTIVE_SOURCE_PREFIX = 'PF_ADAPTIVE_SOURCE:'

export function has_adaptive_source_marker(
  notes: string | null | undefined,
): boolean {
  return Boolean(
    notes
      ?.split('\n')
      .some((line) => line.startsWith(PF_ADAPTIVE_SOURCE_PREFIX)),
  )
}

export function prescription_authority(
  set: Pick<ProgrammedSessionSet, 'source_kind' | 'notes'>,
): PrescriptionAuthorityDecision {
  if (
    has_adaptive_source_marker(set.notes) ||
    parse_adaptive_challenge(set.notes) !== null
  ) {
    return {
      authority: 'adaptive',
      adaptive_change_allowed: true,
      reason:
        'This prescription was previously changed by PROJECT FREAK and may be re-evaluated from newer evidence.',
    }
  }

  if (set.source_kind === 'user') {
    return {
      authority: 'manual',
      adaptive_change_allowed: false,
      reason:
        'Manual prescription changes outrank PROJECT FREAK intra-week adaptation.',
    }
  }

  if (set.source_kind === 'programme_import') {
    return {
      authority: 'coach_import',
      adaptive_change_allowed: true,
      reason:
        'Coach-imported prescription is the weekly baseline and may receive constrained intra-week adaptation.',
    }
  }

  if (set.source_kind === 'sync') {
    return {
      authority: 'synced',
      adaptive_change_allowed: true,
      reason:
        'Synced prescription retains its upstream authority unless it is explicitly marked as a manual override.',
    }
  }

  return {
    authority: 'unknown',
    adaptive_change_allowed: false,
    reason:
      'Prescription authority is unknown, so PROJECT FREAK will preserve it rather than guess.',
  }
}

export function can_apply_adaptive_change(
  set: Pick<ProgrammedSessionSet, 'source_kind' | 'notes'>,
): boolean {
  return prescription_authority(set).adaptive_change_allowed
}
