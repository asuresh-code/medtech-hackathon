import { describe, expect, it } from 'vitest'
import { findSafetyPhrase } from './safety'

describe('findSafetyPhrase', () => {
  it.each([
    'I sometimes think they would be better off without me',
    "I can't go on like this",
    'i just want to disappear',
    'Thought about ending it… want to end it all',
    'feeling SUICIDAL tonight',
    "I'm scared I might hurt the baby",
    'I self harmed last week',
  ])('flags: %s', (text) => {
    expect(findSafetyPhrase(text)).not.toBeNull()
  })

  it.each(['Tired but ok', 'Baby slept well', 'Went to the group on Tuesday', '', null])('does not flag: %s', (text) => {
    expect(findSafetyPhrase(text)).toBeNull()
  })
})
