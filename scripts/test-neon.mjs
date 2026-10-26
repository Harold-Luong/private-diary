import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadConfig } from '../api/src/config.js';
import { createDb } from '../api/src/db.js';

const { chromium, expect } = createRequire(new URL('../web/package.json', import.meta.url))('@playwright/test');
const config = loadConfig();
assert.ok(new URL(config.databaseUrl).hostname.endsWith('.neon.tech'), 'This smoke test requires a Neon DATABASE_URL');
const db = createDb(config.databaseUrl);
const email = `neon-smoke-${randomUUID()}@example.com`;
const password = randomUUID() + randomUUID();
const title = `Neon smoke ${randomUUID()}`;
let browser, userId;
try {
  await db.$connect();
  assert.equal(await db.mood.count(), 5);
  console.log('PASS Neon Postgres: connected; 5 system moods available');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: process.env.SMOKE_BASE_URL || 'http://localhost:5173' });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/register');
  await page.getByLabel('Tên bạn', { exact: true }).fill('Neon Smoke');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Xác nhận mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo sổ nhật ký' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  userId = user.id;
  assert.ok(user.passwordHash.startsWith('$argon2id$'));
  console.log('PASS browser registration -> Express -> Neon user/session persistence');

  await page.getByRole('link', { name: /Viết một trang mới/ }).click();
  await page.getByLabel('Tiêu đề nhật ký').fill(title);
  await page.getByLabel('Nội dung nhật ký').fill('Kiểm tra ghi và đọc nhật ký trên Neon PostgreSQL.');
  await page.getByRole('button', { name: '😊 Vui', exact: true }).click();
  await page.getByLabel('Tên thẻ mới').fill('neon-test');
  await page.getByRole('button', { name: 'Tạo thẻ', exact: true }).click();
  await expect(page.locator('.tag-option')).toHaveText('neon-test');
  await page.getByRole('button', { name: 'Lưu hoàn chỉnh', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/[a-f0-9-]+$/, { timeout: 30000 });
  const detailUrl = page.url();
  const diary = await db.diary.findFirstOrThrow({ where: { userId, title }, include: { tags: true, mood: true } });
  assert.equal(diary.status, 'PUBLISHED');
  assert.equal(diary.tags.length, 1);
  assert.equal(diary.mood.code, 'HAPPY');
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30000 });
  console.log('PASS diary/mood/tag writes verified directly in Neon; reload and refresh-cookie read succeeded');

  await page.getByRole('link', { name: 'Lịch nhật ký', exact: true }).click();
  await expect(page.locator('.calendar-day.written')).toHaveCount(1);
  await page.locator('.calendar-day.written').click();
  await expect(page.locator('.calendar-day-panel')).toContainText('1 trang viết đã lưu');
  await page.goto(detailUrl);
  await page.getByRole('link', { name: 'Chỉnh sửa', exact: true }).click();
  await page.getByLabel('Tiêu đề nhật ký').fill(`${title} updated`);
  await page.getByRole('button', { name: 'Lưu hoàn chỉnh', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${title} updated` })).toBeVisible();
  assert.equal((await db.diary.findUniqueOrThrow({ where: { id: diary.id } })).title, `${title} updated`);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Xóa nhật ký', exact: true }).click();
  await expect(page.getByText('Chưa có trang viết nào ở đây.')).toBeVisible();
  assert.ok((await db.diary.findUniqueOrThrow({ where: { id: diary.id } })).deletedAt);
  console.log('PASS calendar aggregation, diary update and soft-delete persisted in Neon');

  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/diaries');
  await expect(page).toHaveURL(/\/login/);
  assert.equal(await db.authSession.count({ where: { userId, revokedAt: null } }), 0);
  assert.deepEqual(errors, []);
  console.log('PASS logout revoked the Neon session; protected page requires login; no browser errors');
} finally {
  await browser?.close();
  try {
    // Delete only this run's unique fixture; cascading FKs remove its records.
    const result = await db.user.deleteMany({ where: { email, ...(userId ? { id: userId } : {}) } });
    console.log(`CLEANUP removed ${result.count} smoke-test account (and its related records)`);
  } finally { await db.$disconnect(); }
}
