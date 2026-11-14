// SHARED CONTRACT — read by Dev A (patient/platform) and Dev B (engine/clinician).
// Change only via a PR the other dev has seen. Mirrors supabase/migrations/0001_init.sql.

export type Role = 'patient' | 'clinician'

export type FlagLevel = 'urgent' | 'review' | 'drift'

export type ItemNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** EPDS item score, 0-3 (already reverse-scored where the instrument requires it). */
export type ItemValue = 0 | 1 | 2 | 3

export interface Profile {
  id: string // = auth.users.id
  role: Role
  first_name: string
  job_title: string | null // e.g. 'GP', 'Health visitor' (clinicians only)
}

export interface Woman {
  id: string
  user_id: string | null // auth user for the patient app
  pseudonym: string // e.g. 'W-0001'
  first_name: string
  baby_weeks: number
  gp_id: string // named owner for urgent/review flags (NOT NULL in DB)
  hv_id: string // named owner for drift flags (NOT NULL in DB)
  baseline_total: number | null // first complete 7-day EPDS window
  usual_hour: number // 0-23, learned check-in hour
  group_label: string | null // e.g. 'Tuesday 10:00 baby & me group'
  synthetic: boolean
  created_at: string
}

export interface CheckIn {
  id: string
  woman_id: string
  scheduled_for: string // ISO
  items: ItemNo[] // EPDS items planned for this check-in (3-4)
  completed_at: string | null
  note_text: string | null
  reminder_sent_at: string | null
}

export interface ItemAnswer {
  id: string
  woman_id: string
  checkin_id: string
  item_no: ItemNo
  value: ItemValue
  answered_at: string
  via: 'tap' | 'voice'
}

export interface Attendance {
  id: string
  woman_id: string
  session_date: string // YYYY-MM-DD
  attended: boolean
}

export interface Flag {
  id: string
  woman_id: string
  level: FlagLevel
  rule_id: string // e.g. 'U1', 'R1', 'D2'
  reason: string // one human-readable line for the clinician
  rule_version: string
  owner_id: string | null
  due_at: string
  status: 'open' | 'closed'
  created_at: string
}

export type DecisionKind =
  | 'contacted'
  | 'gp_review'
  | 'hv_followup'
  | 'talking_therapies'
  | 'secondary_referral' // reason required
  | 'no_action' // reason required

export interface Decision {
  id: string
  flag_id: string
  woman_id: string
  clinician_id: string
  decision: DecisionKind
  reason: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  actor_id: string | null
  event: string // e.g. 'flag.created', 'brief.viewed', 'decision.made', 'checkin.completed'
  entity: string
  entity_id: string | null
  detail: Record<string, unknown> | null
  at: string
}

// ---- API contracts (Vercel functions) ----

/** POST /api/score — called by the patient app after a check-in. Implemented by Dev B. */
export interface ScoreRequest {
  checkin_id: string
  /** Demo clock (ISO). Omitted in real use. Lets the "advance days" demo control work. */
  now?: string
}
export interface ScoreResponse {
  ok: true
  /** The next scheduled check-in. Never includes any flag or score — patient-safe. */
  next_checkin: Pick<CheckIn, 'id' | 'scheduled_for'> | null
}

/** POST /api/join — exchange a one-time invite code for a sign-in token. Implemented by Dev A. */
export interface JoinRequest {
  code: string
}
export interface JoinResponse {
  token_hash: string
}
