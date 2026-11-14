// Every line the app can speak, built only from approved text (phrases.json + EPDS items).
// scripts/generate-voice.ts pre-generates a natural voice clip for each one.
import { EPDS_ITEMS, EPDS_STEM, type EpdsItem } from '../shared/epds'
import phrases from '../content/phrases'
import { fill } from './copy'

export const questionLine = (item: EpdsItem) => `${EPDS_STEM} ${item.text}.`

export function optionsLine(item: EpdsItem): string {
  const labels = item.options.map((o) => o.label)
  return `${phrases.voiceOptionsIntro} ${labels.slice(0, -1).join('; ')}; or ${labels[labels.length - 1]}.`
}

export const heardLine = (label: string) => fill(phrases.voiceHeard, { answer: label })
export const confirm10Line = (label: string) => fill(phrases.item10Confirm, { answer: label })

export function allVoiceLines(): string[] {
  const lines = new Set<string>()
  for (const item of EPDS_ITEMS) {
    lines.add(questionLine(item))
    lines.add(optionsLine(item))
    for (const o of item.options) lines.add(heardLine(o.label))
  }
  for (const o of EPDS_ITEMS[9].options) lines.add(confirm10Line(o.label))
  for (const k of ['voiceOpener', 'voiceNotClear', 'voiceTapFallback', 'voiceNoteIntro', 'voiceSaving', 'noteThanks', 'crisisVoice'] as const) {
    lines.add(phrases[k])
  }
  for (const l of [...phrases.closeTitle, ...phrases.closeOutward]) lines.add(l)
  return [...lines]
}
