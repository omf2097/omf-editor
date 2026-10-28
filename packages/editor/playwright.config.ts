import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4174);

// Tests must never be audible: the app fixture swaps in a fake AudioContext,
// and the browsers are muted as well for the one test that uses real Web Audio.
const chromiumMuted = { launchOptions: { args: ['--mute-audio'] } };
const firefoxMuted = { launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } };

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/fixtures/build.ts',
  fullyParallel: true,
  // Every worker runs its own browser. The default (half the cores) can exhaust
  // a laptop's memory, so local runs use 4; E2E_WORKERS overrides it.
  workers: process.env.E2E_WORKERS
    ? Number(process.env.E2E_WORKERS)
    : process.env.CI
      ? undefined
      : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumMuted,
        viewport: { width: 1440, height: 900 },
      },
      testIgnore: /gamedata|layout-small/,
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        ...firefoxMuted,
        viewport: { width: 1440, height: 900 },
      },
      // Firefox has no File System Access API.
      testIgnore: /gamedata|layout-small|file-access/,
    },
    {
      name: 'small',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumMuted,
        viewport: { width: 1024, height: 700 },
      },
      testMatch: /layout-small/,
    },
    {
      name: 'gamedata',
      use: { ...devices['Desktop Chrome'], ...chromiumMuted },
      testMatch: /gamedata/,
    },
  ],
  webServer: {
    command: `VITE_TEST_HOOKS=1 pnpm exec vite build --outDir dist-e2e --emptyOutDir && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    // Always our own fresh build: a server left on the port from another
    // checkout or an older build would test the wrong code. --strictPort
    // fails instead when the port is taken; pick another with E2E_PORT.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
