import { defineConfig } from 'vitest/config';

const pkg = (name: string) => ({
  test: { name, include: [`packages/${name}/test/**/*.test.ts`], testTimeout: 60_000 },
});

export default defineConfig({
  test: {
    passWithNoTests: true,
    silent: false,
    projects: [
      { test: { name: 'unit', include: ['test/*.test.ts'] } },
      pkg('cartridge'),
      pkg('transport'),
      pkg('vm'),
      pkg('asm'),
      pkg('qr'),
      pkg('tools'),
      { test: { name: 'robust', include: ['test/robust/**/*.test.ts'], testTimeout: 600_000 } },
      { test: { name: 'blackbox', include: ['test/blackbox/**/*.test.ts'], testTimeout: 300_000 } },
      { test: { name: 'games', include: ['test/games/**/*.test.ts'], testTimeout: 120_000 } },
      { test: { name: 'slice', include: ['test/slice/**/*.test.ts'], testTimeout: 120_000 } },
    ],
  },
});
