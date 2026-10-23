import { z } from 'zod';
import { invalid, unsupported } from './errors.js';
export const id = z.uuid();
export const status = z.enum([
    'DRAFT',
    'PUBLISHED'
]);
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value)=>{
    const date = new Date(`${value}T00:00:00.000Z`);
    return value.slice(0, 4) !== '0000' && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const timezone = z.string().min(1).max(100).refine((value)=>{
    try {
        new Intl.DateTimeFormat('en', {
            timeZone: value
        });
        return !/^[+-]/.test(value);
    } catch  {
        return false;
    }
});
export const displayName = z.string().trim().min(1).max(150).nullable();
export const email = z.string().trim().toLowerCase().pipe(z.email().max(255));
export const theme = z.enum([
    'LIGHT',
    'DARK',
    'SYSTEM'
]);
export const pageFields = {
    page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000)).default(1),
    limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(50)).default(20)
};
export const noQuery = (req, _res, next)=>{
    z.strictObject({}).parse(req.query);
    next();
};
export const jsonBody = (req, _res, next)=>{
    if (!req.is('application/json')) throw unsupported();
    next();
};
export const noBody = (req, _res, next)=>{
    if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) throw invalid();
    next();
};
export const diaryParams = z.strictObject({
    id
});
export const imageParams = z.strictObject({
    id,
    imageId: id
});
export function todayIn(zone, now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const get = (type)=>parts.find((p)=>p.type === type).value;
    return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}
export const toDate = (value)=>new Date(`${value}T00:00:00.000Z`);
export const formatDate = (value)=>value.toISOString().slice(0, 10);
export function monthRange(year, month) {
    const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
    const days = month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28 : [
        4,
        6,
        9,
        11
    ].includes(month) ? 30 : 31;
    return {
        first,
        last: first.slice(0, 8) + days,
        days
    };
}
