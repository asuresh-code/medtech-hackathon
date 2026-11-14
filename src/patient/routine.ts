// Implementation-intention anchors: she picks an existing moment in her day ("after the first morning feed").
// Anchor AFTER a feed, not during one (Mason et al. 2024). See docs/research/engagement.md.
export interface Routine {
  label: string
  hint: string
  hour: number
}

export const ROUTINES: Routine[] = [
  { label: 'After the morning feed', hint: 'around 8am', hour: 8 },
  { label: 'Mid-morning', hint: 'around 11am', hour: 11 },
  { label: "During baby's nap", hint: 'around 2pm', hour: 14 },
  { label: 'After the evening feed', hint: 'around 7pm', hour: 19 },
  { label: 'Before bed', hint: 'around 9pm', hour: 21 },
]

export function routineFor(hour: number | null | undefined): Routine | undefined {
  return ROUTINES.find((r) => r.hour === hour)
}
