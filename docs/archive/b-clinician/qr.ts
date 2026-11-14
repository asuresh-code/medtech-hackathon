// Minimal QR encoder (byte mode, error correction M, versions 1-10) — enough for invite URLs.
// No dependency; follows ISO/IEC 18004 (structure after Nayuki's reference implementation).
// Returns modules[y][x] (true = dark).

const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}
const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver]

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}
function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0)
  r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root)
      if (j + 1 < degree) r[j] ^= r[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return r
}
function rsRemainder(data: number[], div: number[]): number[] {
  const r = new Array<number>(div.length).fill(0)
  for (const b of data) {
    const f = b ^ (r.shift() as number)
    r.push(0)
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)))
  }
  return r
}

function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

export function encodeQr(text: string, forceMask?: number, forceVersion?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  let ver = forceVersion ?? 1
  const bitsNeeded = (v: number) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8
  while (!forceVersion && bitsNeeded(ver) > dataCodewords(ver) * 8) if (++ver > 10) throw new Error('QR: text too long')

  // Data bits → codewords
  const bits: number[] = []
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  put(0x4, 4)
  put(bytes.length, ver < 10 ? 8 : 16)
  bytes.forEach((b) => put(b, 8))
  const cap = dataCodewords(ver) * 8
  put(0, Math.min(4, cap - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))

  // Error correction + interleave
  const numBlocks = BLOCKS_M[ver]
  const eccLen = ECC_PER_BLOCK_M[ver]
  const raw = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (raw % numBlocks)
  const shortLen = Math.floor(raw / numBlocks)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0].length; i++)
    for (let j = 0; j < blocks.length; j++) if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j][i])

  // Function patterns
  const size = ver * 4 + 17
  const mod = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => {
    mod[y][x] = dark
    fn[y][x] = true
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
      }
  }
  const al = alignmentPositions(ver, size)
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  const drawFormat = (mask: number) => {
    const d = (0 << 3) | mask // ECC level M = 0b00
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const b = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((b >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6))
    set(8, 8, bit(7))
    set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const b = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) === 1
      const a = size - 11 + (i % 3), c = Math.floor(i / 3)
      set(a, c, dark)
      set(c, a, dark)
    }
  }

  // Codewords in zig-zag order
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
        if (!fn[y][x] && i < codewords.length * 8) {
          mod[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1
          i++
        }
      }
  }

  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]
  }
  let mask = forceMask ?? 0
  if (forceMask === undefined) {
    let best = Infinity
    for (let m = 0; m < 8; m++) {
      applyMask(m)
      drawFormat(m)
      const p = penalty(mod)
      if (p < best) {
        best = p
        mask = m
      }
      applyMask(m) // undo (XOR)
    }
  }
  applyMask(mask)
  drawFormat(mask)
  return mod
}

/** Simplified mask penalty (runs, 2x2 blocks, finder-like patterns, balance). Any mask decodes. */
function penalty(m: boolean[][]): number {
  const n = m.length
  let p = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    for (let i = 1; i < n; i++) {
      if (get(i) === get(i - 1)) run++
      else {
        if (run >= 5) p += run - 2
        run = 1
      }
    }
    if (run >= 5) p += run - 2
    const s = Array.from({ length: n }, (_, i) => (get(i) ? '1' : '0')).join('')
    p += 40 * ((s.match(/1011101(?=0000)/g) ?? []).length + (s.match(/0000(?=1011101)/g) ?? []).length)
  }
  for (let k = 0; k < n; k++) {
    line((i) => m[k][i])
    line((i) => m[i][k])
  }
  let dark = 0
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (m[y][x]) dark++
      if (y < n - 1 && x < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3
    }
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return p
}
