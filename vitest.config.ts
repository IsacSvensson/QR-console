import { defineConfig } from 'vitest/config';

const pkg = (name: string) => ({
  test: { name, include: [`packages/${name}/test/**/*.test.ts`], testTimeout: 60_000 },
});

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'unit', include: ['test/**/*.test.ts'] } },
      pkg('cartridge'),
      pkg('transport'),
      pkg('vm'),
      pkg('asm'),
      pkg('qr'),
      pkg('tools'),
    ],
  },
});
