// SHARED CONTRACT — EPDS item text and scoring.
//
// Source: Cox, J.L., Holden, J.M. and Sagovsky, R. (1987). Detection of postnatal depression:
// Development of the 10-item Edinburgh Postnatal Depression Scale. British Journal of Psychiatry
// 150:782-786. Item text must be used verbatim — do NOT paraphrase.
// TODO(Dev A / Esme): confirm licence terms and check this text against the official form before the demo.
//
// Option order is as printed on the form. `value` is the score for that option
// (items 3, 5-10 are reverse-scored on the form; values below already reflect that).

import type { ItemNo, ItemValue } from './types'

export interface EpdsOption {
  label: string
  value: ItemValue
}

export interface EpdsItem {
  no: ItemNo
  text: string
  options: EpdsOption[]
}

export const EPDS_STEM = 'In the past 7 days:'

export const EPDS_CITATION =
  'Edinburgh Postnatal Depression Scale (EPDS). Cox, J.L., Holden, J.M. and Sagovsky, R. (1987). British Journal of Psychiatry 150:782-786.'

export const EPDS_ITEMS: EpdsItem[] = [
  {
    no: 1,
    text: 'I have been able to laugh and see the funny side of things',
    options: [
      { label: 'As much as I always could', value: 0 },
      { label: 'Not quite so much now', value: 1 },
      { label: 'Definitely not so much now', value: 2 },
      { label: 'Not at all', value: 3 },
    ],
  },
  {
    no: 2,
    text: 'I have looked forward with enjoyment to things',
    options: [
      { label: 'As much as I ever did', value: 0 },
      { label: 'Rather less than I used to', value: 1 },
      { label: 'Definitely less than I used to', value: 2 },
      { label: 'Hardly at all', value: 3 },
    ],
  },
  {
    no: 3,
    text: 'I have blamed myself unnecessarily when things went wrong',
    options: [
      { label: 'Yes, most of the time', value: 3 },
      { label: 'Yes, some of the time', value: 2 },
      { label: 'Not very often', value: 1 },
      { label: 'No, never', value: 0 },
    ],
  },
  {
    no: 4,
    text: 'I have been anxious or worried for no good reason',
    options: [
      { label: 'No, not at all', value: 0 },
      { label: 'Hardly ever', value: 1 },
      { label: 'Yes, sometimes', value: 2 },
      { label: 'Yes, very often', value: 3 },
    ],
  },
  {
    no: 5,
    text: 'I have felt scared or panicky for no very good reason',
    options: [
      { label: 'Yes, quite a lot', value: 3 },
      { label: 'Yes, sometimes', value: 2 },
      { label: 'No, not much', value: 1 },
      { label: 'No, not at all', value: 0 },
    ],
  },
  {
    no: 6,
    text: 'Things have been getting on top of me',
    options: [
      { label: "Yes, most of the time I haven't been able to cope at all", value: 3 },
      { label: "Yes, sometimes I haven't been coping as well as usual", value: 2 },
      { label: 'No, most of the time I have coped quite well', value: 1 },
      { label: 'No, I have been coping as well as ever', value: 0 },
    ],
  },
  {
    no: 7,
    text: 'I have been so unhappy that I have had difficulty sleeping',
    options: [
      { label: 'Yes, most of the time', value: 3 },
      { label: 'Yes, sometimes', value: 2 },
      { label: 'Not very often', value: 1 },
      { label: 'No, not at all', value: 0 },
    ],
  },
  {
    no: 8,
    text: 'I have felt sad or miserable',
    options: [
      { label: 'Yes, most of the time', value: 3 },
      { label: 'Yes, quite often', value: 2 },
      { label: 'Not very often', value: 1 },
      { label: 'No, not at all', value: 0 },
    ],
  },
  {
    no: 9,
    text: 'I have been so unhappy that I have been crying',
    options: [
      { label: 'Yes, most of the time', value: 3 },
      { label: 'Yes, quite often', value: 2 },
      { label: 'Only occasionally', value: 1 },
      { label: 'No, never', value: 0 },
    ],
  },
  {
    no: 10,
    text: 'The thought of harming myself has occurred to me',
    options: [
      { label: 'Yes, quite often', value: 3 },
      { label: 'Sometimes', value: 2 },
      { label: 'Hardly ever', value: 1 },
      { label: 'Never', value: 0 },
    ],
  },
]

/** Item 10 is the self-harm item: needs a deliberate, confirmed answer and can never be skipped. */
export const SELF_HARM_ITEM: ItemNo = 10

export function getItem(no: ItemNo): EpdsItem {
  const item = EPDS_ITEMS.find((i) => i.no === no)
  if (!item) throw new Error(`Unknown EPDS item ${no}`)
  return item
}

/** True when an item-10 answer is anything other than "Never". */
export function isPositiveSelfHarm(itemNo: ItemNo, value: ItemValue): boolean {
  return itemNo === SELF_HARM_ITEM && value > 0
}
