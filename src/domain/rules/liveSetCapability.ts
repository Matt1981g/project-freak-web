export type LiveSetCapabilityInput = {
  target_duration_seconds?: number | null
  components?: readonly {
    target_duration_seconds?: number | null
  }[]
}

export type LiveSetCapabilityIssue = {
  code: 'timed_primary_not_supported' | 'timed_component_not_supported'
  message: string
}

/**
 * Contract between programme JSON and the current gym logger.
 *
 * PF can faithfully log rep-based primary sets and explicit rep-based
 * drop/rest-pause/myo/partial components. Timed primary/component work is
 * represented by the domain model but is not yet editable by the live logger,
 * so programme import must reject it rather than silently recording reps.
 */
export function live_set_capability_issues(
  input: LiveSetCapabilityInput,
): LiveSetCapabilityIssue[] {
  const issues: LiveSetCapabilityIssue[] = []

  if (input.target_duration_seconds != null) {
    issues.push({
      code: 'timed_primary_not_supported',
      message:
        'Timed primary sets are not supported by the live logger yet. Prescribe reps instead.',
    })
  }

  if (
    (input.components ?? []).some(
      (component) => component.target_duration_seconds != null,
    )
  ) {
    issues.push({
      code: 'timed_component_not_supported',
      message:
        'Timed set components are not supported by the live logger yet. Prescribe reps instead.',
    })
  }

  return issues
}
