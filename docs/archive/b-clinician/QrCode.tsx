import { useMemo } from 'react'
import { encodeQr } from './qr'

/** Inline SVG QR code (no dependency). 4-module quiet zone; dark ink on white for reliable scanning. */
export function QrCode({ text, size = 220 }: { text: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const m = encodeQr(text)
    let d = ''
    m.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + 4} ${y + 4}h1v1h-1z`)))
    return { path: d, n: m.length + 8 }
  }, [text])
  return (
    <svg className="cl-qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#ffffff" />
      <path d={path} fill="#1b1916" />
    </svg>
  )
}
