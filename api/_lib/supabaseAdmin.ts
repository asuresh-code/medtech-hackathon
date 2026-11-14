// Server-only Supabase client (service role — bypasses RLS). Never import from src/.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function adminClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Resolve the caller from the `Authorization: Bearer <access_token>` header. */
export async function callerId(admin: SupabaseClient, authHeader: string | undefined): Promise<string | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : (data.user?.id ?? null)
}

/** Synthetic, non-deliverable login address for a patient (no real email ever used). */
export function patientEmail(pseudonym: string): string {
  return `${pseudonym.toLowerCase()}@patients.aluna.example.com`
}

/**
 * Returns a magic-link token hash for a patient, creating a confirmed auth user first if needed.
 * (Generating a link for a brand-new user yields a signup token that verifyOtp('magiclink') rejects.)
 */
export async function patientSignInToken(
  admin: SupabaseClient,
  pseudonym: string,
): Promise<{ userId: string; tokenHash: string }> {
  const email = patientEmail(pseudonym)
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (created.error && !/already|registered|exists/i.test(created.error.message)) throw created.error
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.user) throw error ?? new Error('generateLink returned no user')
  return { userId: data.user.id, tokenHash: data.properties.hashed_token }
}
