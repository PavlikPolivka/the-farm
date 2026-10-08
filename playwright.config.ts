import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
  ],
  // The production server serving the production build: what the phones get.
  webServer: {
    command: 'node server/dist/index.js',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), STATIC_DIR: 'client/dist', DB_PATH: ':memory:', NODE_ENV: 'test' },
  },
});
