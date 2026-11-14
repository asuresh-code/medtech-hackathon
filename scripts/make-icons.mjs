// Generates public/icon-192.png and public/icon-512.png (crescent on cream) with no image deps.
// Run: npm run icons
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CREAM = [0xf7, 0xf3, 0xec]
const TAUPE = [0x8c, 0x7b, 0x65]

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function icon(size) {
  const s = size / 512
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s
      const py = (y + 0.5) / s
      const inMoon = (px - 256) ** 2 + (py - 256) ** 2 <= 132 ** 2
      const inBite = (px - 306) ** 2 + (py - 220) ** 2 <= 118 ** 2
      const c = inMoon && !inBite ? TAUPE : CREAM
      row.set(c, 1 + x * 3)
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size))
  console.log(`wrote public/icon-${size}.png`)
}
