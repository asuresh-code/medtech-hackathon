// Pitch QR codes: high-contrast PNG + SVG for slides, and a printable sheet (public/qr/index.html).
// Run: node scripts/make-qr.mjs <demo-code>
import QRCode from 'qrcode'
import { writeFileSync } from 'node:fs'

const code = process.argv[2]
if (!/^\d{6}$/.test(code ?? '')) throw new Error('usage: node scripts/make-qr.mjs <6-digit DEMO_INVITE_CODE>')
const base = 'https://aluna-flame.vercel.app'
const links = {
  patient: { url: `${base}/join?code=${code}`, title: 'Try it as a mother', sub: 'Opens the patient app as synthetic patient “Alex”' },
  clinician: { url: `${base}/clinician`, title: 'Try it as the GP', sub: 'Tap “Dr Okafor · GP” — queue, brief, decision' },
}
const opts = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#2b2925', light: '#ffffff' } }

const svgs = {}
for (const [name, l] of Object.entries(links)) {
  await QRCode.toFile(`public/qr/${name}.png`, l.url, { ...opts, width: 1024 })
  svgs[name] = await QRCode.toString(l.url, { ...opts, type: 'svg' })
  writeFileSync(`public/qr/${name}.svg`, svgs[name])
  console.log(`${name}: ${l.url} → public/qr/${name}.png / .svg`)
}

const card = (name) => `
  <section class="card">
    <h2>${links[name].title}</h2>
    <div class="qr">${svgs[name]}</div>
    <p class="sub">${links[name].sub}</p>
    <p class="url">${links[name].url.replace('https://', '')}</p>
  </section>`

writeFileSync(
  'public/qr/index.html',
  `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aluna QR codes</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --bg:#f7f3ec; --ink:#2b2925; --muted:#7a7367; --line:#e7e0d4; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Source Sans 3',system-ui,sans-serif; padding:32px 16px; }
  h1 { font-family:'Fraunces',Georgia,serif; font-weight:500; text-align:center; font-size:40px; margin:0 0 4px; }
  .lead { text-align:center; color:var(--muted); margin:0 0 28px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:24px; max-width:900px; margin:0 auto; }
  .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:24px; text-align:center; }
  .card h2 { font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:28px; margin:0 0 12px; }
  .qr svg { width:100%; max-width:320px; height:auto; }
  .sub { margin:10px 0 4px; }
  .url { color:var(--muted); font-size:13px; word-break:break-all; margin:0; }
  .note { text-align:center; color:var(--muted); font-size:13px; margin-top:24px; }
  @media print { body { background:#fff; } .card { break-inside:avoid; } }
</style></head>
<body>
  <h1>Aluna</h1>
  <p class="lead">Scan with your phone camera. Everything you see is synthetic demo data.</p>
  <div class="grid">${card('patient')}${card('clinician')}</div>
  <p class="note">Aluna is a hackathon prototype, not a medical service. In an emergency call 999.</p>
</body></html>
`,
)
console.log('sheet → public/qr/index.html')
