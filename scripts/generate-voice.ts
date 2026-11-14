// Pre-generates natural-voice audio for every fixed line the patient app speaks
// (approved phrases + verbatim EPDS items). Runs ONCE on a developer laptop; the phone just plays
// the static files in public/voice/. Nothing about any patient is ever sent to the TTS provider.
//
// Provider (first key found in .env.local wins):
//   ELEVENLABS_API_KEY  (+ optional ELEVENLABS_VOICE_ID, default "Lily" — British, warm)
//   OPENAI_API_KEY      (+ optional OPENAI_TTS_VOICE, default "sage")
// Run: npm run voice        (re-run any time phrases change; unchanged lines are skipped)

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clipKey } from '../src/lib/speech.js'
import { allVoiceLines } from '../src/patient/voiceLines.js'

const OUT = join(process.cwd(), 'public', 'voice')
const STYLE =
  'Calm, warm, gentle British English. Unhurried and clear, like a kind practice nurse. Neutral, never enthusiastic or sing-song.'

interface Provider {
  id: string
  synth(text: string): Promise<Buffer>
}

function elevenLabs(key: string): Provider {
  const voice = process.env.ELEVENLABS_VOICE_ID || 'pFZP5JQG7iQjIQuC4Bku' // "Lily"
  return {
    id: `elevenlabs:${voice}`,
    async synth(text) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.1, speed: 0.95 },
        }),
      })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
      return Buffer.from(await res.arrayBuffer())
    },
  }
}

function openAI(key: string): Provider {
  const voice = process.env.OPENAI_TTS_VOICE || 'sage'
  return {
    id: `openai:gpt-4o-mini-tts:${voice}`,
    async synth(text) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions: STYLE, response_format: 'mp3' }),
      })
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
      return Buffer.from(await res.arrayBuffer())
    },
  }
}

function pickProvider(): Provider {
  if (process.env.ELEVENLABS_API_KEY) return elevenLabs(process.env.ELEVENLABS_API_KEY)
  if (process.env.OPENAI_API_KEY) return openAI(process.env.OPENAI_API_KEY)
  console.error('No TTS key. Add ELEVENLABS_API_KEY or OPENAI_API_KEY to .env.local, then run: npm run voice')
  process.exit(1)
}

async function main() {
  const provider = pickProvider()
  mkdirSync(OUT, { recursive: true })
  const manifestPath = join(OUT, 'manifest.json')
  const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { clips: {} }
  const clips: Record<string, string> = {}
  const lines = allVoiceLines()
  let made = 0

  for (const text of lines) {
    const file = createHash('sha1').update(`${provider.id}|${text}`).digest('hex').slice(0, 16) + '.mp3'
    if (!existsSync(join(OUT, file))) {
      writeFileSync(join(OUT, file), await provider.synth(text))
      made++
      process.stdout.write('.')
    }
    clips[clipKey(text)] = file
  }

  writeFileSync(manifestPath, JSON.stringify({ voice: provider.id, generated: new Date().toISOString(), clips }, null, 2))
  const dropped = Object.keys(old.clips ?? {}).filter((k) => !(k in clips)).length
  console.log(`\n${lines.length} lines · ${made} new clips · ${dropped} stale entries dropped · voice ${provider.id}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
