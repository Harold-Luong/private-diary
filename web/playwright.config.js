import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', workers: 1, timeout: 60000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} },
  webServer: [
    { command: 'node tests/api-server.mjs', url: 'http://127.0.0.1:4180/api-docs/', timeout: 60000 },
    { command: 'npm run dev -- --host localhost --port 4173', url: 'http://localhost:4173', env: { API_PROXY_TARGET: 'http://127.0.0.1:4180', VITE_API_BASE_URL: '/api/v1' }, timeout: 30000 },
  ],
})
