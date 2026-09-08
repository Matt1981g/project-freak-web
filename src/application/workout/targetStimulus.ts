export type TargetStimulusRating = 'target' | 'mixed' | 'wrong_area'

export const TARGET_STIMULUS_TAG_PREFIX = 'pf:target_stimulus:'

export function read_target_stimulus(
  tags: readonly string[] | null | undefined,
): TargetStimulusRating | null {
  const tag = tags?.find((value) =>
    value.startsWith(TARGET_STIMULUS_TAG_PREFIX),
  )
  if (!tag) return null

  const value = tag.slice(TARGET_STIMULUS_TAG_PREFIX.length)
  return value === 'target' || value === 'mixed' || value === 'wrong_area'
    ? value
    : null
}

export function with_target_stimulus_tag(
  tags: readonly string[],
  rating: TargetStimulusRating | null,
): string[] {
  const preserved = tags.filter(
    (value) => !value.startsWith(TARGET_STIMULUS_TAG_PREFIX),
  )

  return rating === null
    ? preserved
    : [...preserved, `${TARGET_STIMULUS_TAG_PREFIX}${rating}`]
}
