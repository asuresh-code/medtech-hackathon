// Patient app E2E (Dev A). Needs: .env.local loaded, `npm run seed:dev` run once, app running.
import { expect, test, type Page } from '@playwright/test'
import { adminClient } from '../../api/_lib/supabaseAdmin.js'

const admin = adminClient()

// Words that must never appear on any patient screen (no scores, flags or verdicts).
const FORBIDDEN = /\b(score|scores|flag|flagged|risk|step \d|threshold|depress\w*|you're fine|you are fine|nothing to worry)\b/i

async function assertNoVerdicts(page: Page) {
  const text = await page.locator('body').innerText()
  expect(text, 'patient screen leaked a score/verdict word').not.toMatch(FORBIDDEN)
}

async function freshInvite(items: number[]): Promise<string> {
  const { data: w } = await admin.from('women').select('id, gp_id').eq('pseudonym', 'W-DEV1').single()
  // Close any open check-ins and create one due now with the requested items.
  await admin.from('checkins').delete().eq('woman_id', w!.id).is('completed_at', null)
  await admin.from('checkins').insert({ woman_id: w!.id, scheduled_for: new Date(Date.now() - 60_000).toISOString(), items })
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await admin.from('invite_codes').insert({ code, woman_id: w!.id, created_by: w!.gp_id })
  return code
}

async function signIn(page: Page, code: string) {
  await page.goto(`/join?code=${code}`)
  await expect(page.getByTestId('welcome-next')).toBeVisible() // first-run onboarding
  await page.goto('/')
  await expect(page.getByTestId('home-status')).toBeVisible()
}

test('code sign-in → full check-in by tap → neutral close, no verdicts anywhere', async ({ page }) => {
  await signIn(page, await freshInvite([1, 2, 3]))
  await assertNoVerdicts(page)
  await page.getByTestId('start-checkin').click()
  await page.getByTestId('begin').click()

  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId('next')).toBeDisabled()
    await page.getByTestId('option-1').click()
    await assertNoVerdicts(page)
    await page.getByTestId('next').click()
  }

  await page.getByTestId('note').fill('Tired but ok this week')
  await page.getByTestId('note-save').click()
  await expect(page.getByTestId('close')).toBeVisible()
  await assertNoVerdicts(page)
})

test('item 10: no default, needs deliberate confirm, positive answer shows crisis contacts', async ({ page }) => {
  await signIn(page, await freshInvite([10]))
  await page.getByTestId('start-checkin').click()
  await page.getByTestId('begin').click()

  await expect(page.getByTestId('next')).toBeDisabled() // nothing pre-selected
  await page.getByTestId('option-2').click() // "Hardly ever"
  await page.getByTestId('next').click()
  await expect(page.getByTestId('confirm10')).toBeVisible()
  await page.getByTestId('confirm-change').click() // can go back
  await page.getByTestId('option-2').click()
  await page.getByTestId('next').click()
  await page.getByTestId('confirm-yes').click()

  await expect(page.getByTestId('crisis-screen')).toBeVisible()
  await expect(page.getByRole('link', { name: /Call 999/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /116 123/ })).toBeVisible()
  await assertNoVerdicts(page)
})

test('a disclosure in the note shows crisis contacts', async ({ page }) => {
  await signIn(page, await freshInvite([4]))
  await page.getByTestId('start-checkin').click()
  await page.getByTestId('begin').click()
  await page.getByTestId('option-0').click()
  await page.getByTestId('next').click()
  await page.getByTestId('note').fill("Honestly they'd be better off without me")
  await page.getByTestId('note-save').click()
  await expect(page.getByTestId('crisis-screen')).toBeVisible()
})

test('"Need help now?" works with the network off', async ({ page, context }) => {
  await signIn(page, await freshInvite([1]))
  await context.setOffline(true)
  await page.getByTestId('help-link').click()
  await expect(page.getByTestId('crisis-screen')).toBeVisible()
  await context.setOffline(false)
})
