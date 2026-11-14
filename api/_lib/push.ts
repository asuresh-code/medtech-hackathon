// Server-side Web Push helper (Dev A). VAPID keys live in env; nothing here touches an LLM.
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

let configured = false
function configure() {
  if (configured) return
  const pub = process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) throw new Error('Missing VAPID keys')
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:aluna-demo@example.com', pub, priv)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

/** Send to every subscription of one woman. Returns how many were delivered. Prunes dead subscriptions. */
export async function sendToWoman(admin: SupabaseClient, womanId: string, payload: PushPayload): Promise<number> {
  configure()
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('woman_id', womanId)
  let delivered = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'normal' },
      )
      delivered++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  return delivered
}

/** UK local hour (Vercel runs in UTC). */
export function ukHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(d))
}
