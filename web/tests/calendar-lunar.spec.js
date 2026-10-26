import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'America/Los_Angeles' })

async function openCalendar(page, date) {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00+07:00`))
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ json: {
    success: true,
    data: { accessToken: 'calendar-test', user: { displayName: 'Minh Anh', email: 'calendar@example.com', settings: { timezone: 'Asia/Ho_Chi_Minh', theme: 'LIGHT' } } },
  } }))
  await page.route('**/api/v1/diaries/calendar?*', route => {
    const query = new URL(route.request().url()).searchParams
    const year = Number(query.get('year')), month = Number(query.get('month'))
    const days = Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => {
      const day = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
      const publishedCount = day === date ? 1 : 0
      const draftCount = day === date && !query.get('status') ? 1 : 0
      return { date: day, total: publishedCount + draftCount, publishedCount, draftCount }
    })
    return route.fulfill({ json: { success: true, data: { year, month, timezone: 'Asia/Ho_Chi_Minh', days } } })
  })
  await page.goto('/calendar')
  await expect(page.locator('.calendar-day')).not.toHaveCount(0)
}

test('calendar shows Vietnamese Tet and keeps diary navigation on solar dates', async ({ page }) => {
  await openCalendar(page, '2026-02-17')
  const selected = page.locator('.calendar-day.selected')
  await expect(page.locator('.calendar-day .lunar-date')).toHaveCount(28)
  await expect(selected.locator('.lunar-date')).toHaveText('1/1')
  await expect(selected).toHaveAccessibleName(/Âm lịch: Ngày 1 tháng 1 năm Bính Ngọ \(2026\): 2 trang viết/)
  await expect(page.locator('.selected-lunar-date')).toContainText('Ngày 1 tháng 1 năm Bính Ngọ (2026)')
  await expect(page.getByRole('link', { name: 'Viết cho ngày này' })).toHaveAttribute('href', '/diaries/new?date=2026-02-17')
  await expect(page.getByRole('link', { name: 'Mở trang viết' })).toHaveAttribute('href', '/diaries?fromDate=2026-02-17&toDate=2026-02-17')
  await page.getByLabel('Lọc trạng thái lịch').selectOption('PUBLISHED')
  await expect(selected.locator('.calendar-entry-count')).toHaveText('1 trang')
  await expect(selected.locator('.lunar-date')).toHaveText('1/1')
  await expect(page.getByRole('link', { name: 'Mở trang viết' })).toHaveAttribute('href', '/diaries?fromDate=2026-02-17&toDate=2026-02-17&status=PUBLISHED')
  await page.getByRole('button', { name: 'Tháng trước' }).click()
  await expect(page.locator('.calendar-day .lunar-date')).toHaveCount(31)
  await expect(page.locator('.selected-lunar-date')).toContainText('(2025)')
  await expect(page.getByRole('link', { name: 'Viết cho ngày này' })).toHaveAttribute('href', '/diaries/new?date=2026-01-01')
  await page.getByRole('button', { name: 'Tháng sau' }).click()
  await expect(page.locator('.calendar-day .lunar-date')).toHaveCount(28)
})

test('leap-month labels fit small screens and update when another day is selected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openCalendar(page, '2023-03-22')
  await expect(page.locator('.calendar-day.selected .lunar-date')).toHaveText('1/2 N')
  await expect(page.locator('.selected-lunar-date')).toContainText('Ngày 1 tháng 2 nhuận năm Quý Mão (2023)')
  await page.screenshot({ path: 'test-results/calendar-lunar-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('.calendar-day').evaluateAll(days => days.every(day => {
    const cell = day.getBoundingClientRect()
    return [...day.children].every(child => {
      const bounds = child.getBoundingClientRect()
      return bounds.left >= cell.left && bounds.right <= cell.right && bounds.top >= cell.top && bounds.bottom <= cell.bottom
    })
  }))).toBe(true)
  await page.locator('.calendar-day').nth(22).click()
  await expect(page.locator('.selected-lunar-date')).toContainText('Ngày 2 tháng 2 nhuận')
  await expect(page.getByRole('link', { name: 'Viết cho ngày này' })).toHaveAttribute('href', '/diaries/new?date=2023-03-23')
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.screenshot({ path: 'test-results/calendar-lunar-desktop-dark.png', fullPage: true })
})
