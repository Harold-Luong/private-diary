import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vietnameseLunarDate, lunarDayLabel, lunarDateLabel } from '../src/lib/lunar.js'

// Known Vietnamese calendar dates; 2007 Tết was a day earlier than Chinese New Year.
const fixtures = [
  ['2007-02-17', 1, 1, 2007, false],
  ['2024-02-09', 30, 12, 2023, false],
  ['2024-02-10', 1, 1, 2024, false],
  ['2025-01-29', 1, 1, 2025, false],
  ['2026-02-17', 1, 1, 2026, false],
  ['2024-09-17', 15, 8, 2024, false],
  ['2023-03-21', 30, 2, 2023, false],
  ['2023-03-22', 1, 2, 2023, true],
  ['2023-04-19', 29, 2, 2023, true],
  ['2023-04-20', 1, 3, 2023, false],
  ['2025-07-25', 1, 6, 2025, true],
]

test('Vietnamese dates, year rollover and leap months stay the same across browser timezones', () => {
  const originalTimezone = process.env.TZ
  try {
    for (const timezone of ['Asia/Ho_Chi_Minh', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone
      for (const [date, day, month, year, isLeap] of fixtures) {
        const lunar = vietnameseLunarDate(date)
        assert.ok(lunar, `${date} in ${timezone}`)
        assert.deepEqual([lunar.day, lunar.month, lunar.year, lunar.isLeap], [day, month, year, isLeap], `${date} in ${timezone}`)
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
})

test('labels show month boundaries, leap months and the Vietnamese year name', () => {
  const leap = vietnameseLunarDate('2023-03-22')
  assert.equal(lunarDayLabel(leap), '1/2 N')
  assert.equal(lunarDateLabel(leap), 'Ngày 1 tháng 2 nhuận năm Quý Mão (2023)')
  const nextDay = vietnameseLunarDate('2023-03-23')
  assert.equal(lunarDayLabel(nextDay), '2 N')
  assert.equal(lunarDayLabel(nextDay, true), '2/2 N')
  assert.equal(lunarDateLabel(vietnameseLunarDate('2026-02-17')), 'Ngày 1 tháng 1 năm Bính Ngọ (2026)')
})

test('unsupported or invalid dates do not break the calendar', () => {
  for (const date of [null, '', 'invalid', '2026-2-17', '2026-02-30', '2025-02-29', '2026-13-01', '1799-12-31', '2200-01-01']) {
    assert.equal(vietnameseLunarDate(date), null)
  }
  assert.ok(vietnameseLunarDate('1800-01-01'))
  assert.ok(vietnameseLunarDate('2199-12-31'))
  assert.ok(vietnameseLunarDate('2024-02-29'))
  assert.equal(lunarDayLabel(null), '')
  assert.equal(lunarDateLabel(null), '')
})
