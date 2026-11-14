// Clinician E2E: demo GP login → queue order → Sarah's brief explains the drift → decision is recorded.
// Needs `npm run seed:dev` + `npm run seed`. Re-run `npm run seed` afterwards to restore the demo cast.
import { expect, test } from '@playwright/test'

test('GP: queue is urgent → review → drift; brief shows rule + source; decision closes the flag', async ({ page }) => {
  const shots = process.env.SHOT_DIR
  await page.goto('/clinician')
  await page.getByTestId('demo-gp').click()
  const rows = page.getByTestId('queue-row')
  await expect(rows.first()).toBeVisible()
  const text = await rows.allInnerTexts()
  const levels = text.map((t) => (/urgent/i.test(t) ? 3 : /review/i.test(t) ? 2 : 1))
  expect(levels).toEqual([...levels].sort((a, b) => b - a))
  expect(text.join(' ')).toMatch(/Priya/)
  if (shots) await page.screenshot({ path: `${shots}/c-queue.png`, fullPage: true })

  await rows.filter({ hasText: 'W-SARAH' }).click()
  await expect(page.getByText(/D1: EPDS 11, up 5 from her baseline 6/)).toBeVisible()
  await expect(page.getByText(/Matthey 2004/)).toBeVisible()
  if (shots) await page.screenshot({ path: `${shots}/c-brief.png`, fullPage: true })

  await page.getByTestId('decision-hv_followup').click()
  await page.getByTestId('decision-submit').click()
  await expect(page.getByText(/Recorded: Health visitor follow-up/)).toBeVisible()
  await expect(page.getByText('No open flags.')).toBeVisible()
})

test('secondary referral needs a reason', async ({ page }) => {
  await page.goto('/clinician')
  await page.getByTestId('demo-gp').click()
  await page.getByTestId('queue-row').filter({ hasText: 'W-MAYA' }).click()
  await page.getByTestId('decision-secondary_referral').click()
  await expect(page.getByTestId('decision-submit')).toBeDisabled()
})
