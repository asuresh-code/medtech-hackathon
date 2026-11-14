import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { now } from '../lib/demoClock'
import type { CheckIn } from '../shared/types'

export interface PatientMe {
  id: string
  first_name: string
  baby_weeks: number
  usual_hour: number
  group_label: string | null
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, loading }
}

/** Patient's own safe profile + her due / next check-in. Never reads scores or flags. */
export function usePatientHome(enabled: boolean) {
  const [me, setMe] = useState<PatientMe | null>(null)
  const [due, setDue] = useState<CheckIn | null>(null)
  const [next, setNext] = useState<CheckIn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    const t = now().toISOString()
    const [meRes, dueRes, nextRes] = await Promise.all([
      supabase.from('patient_me').select('*').maybeSingle(),
      supabase
        .from('checkins')
        .select('*')
        .is('completed_at', null)
        .lte('scheduled_for', t)
        .order('scheduled_for', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('checkins')
        .select('*')
        .is('completed_at', null)
        .gt('scheduled_for', t)
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
    const err = meRes.error ?? dueRes.error ?? nextRes.error
    if (err) setError(err.message)
    setMe((meRes.data as PatientMe | null) ?? null)
    setDue((dueRes.data as CheckIn | null) ?? null)
    setNext((nextRes.data as CheckIn | null) ?? null)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { me, due, next, error, loading, refresh }
}
