import { SolarDate } from '@nghiavuive/lunar_date_vi/dist/index.mjs'

// Vietnamese lunar calendar tables (Hồ Ngọc Đức), including leap months.
// Pass calendar components, not a UTC timestamp: diary dates are date-only.
// https://github.com/nacana22/lunar-date
export function vietnameseLunarDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    const [year, month, day] = date.split('-').map(Number)
    // Limit to modern Gregorian dates supported by the conversion tables.
    if (year < 1800 || year > 2199) return null
    try {
        const lunar = new SolarDate({ year, month, day }).toLunarDate()
        return { day: lunar.day, month: lunar.month, year: lunar.year, isLeap: lunar.leap_month, yearName: lunar.getYearName() }
    } catch {
        return null
    }
}

export function lunarDayLabel(lunar, showMonth = false) {
    if (!lunar) return ''
    return `${lunar.day}${showMonth || lunar.day === 1 ? `/${lunar.month}` : ''}${lunar.isLeap ? ' N' : ''}`
}

export function lunarDateLabel(lunar) {
    if (!lunar) return ''
    return `Ngày ${lunar.day} tháng ${lunar.month}${lunar.isLeap ? ' nhuận' : ''} năm ${lunar.yearName} (${lunar.year})`
}
