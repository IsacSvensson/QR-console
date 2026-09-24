import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;
const fakeCamera = (game: string) => ({
  ...devices['Desktop Chrome'],
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=.tmp/e2e/${game}.y4m`],
  },
});

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}/` },
  projects: [
    { name: 'app', testMatch: /app\.spec\.ts/, use: fakeCamera('breakout') },
    { name: 'offline', testMatch: /offline\.spec\.ts/, use: fakeCamera('pong') },
  ],
  webServer: {
    command: `npm run build -w apps/web && node e2e/static-server.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
