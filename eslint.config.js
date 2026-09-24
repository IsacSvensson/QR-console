import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const internal = ['cartridge', 'transport', 'vm', 'asm', 'qr', 'tools', 'web'];

/** SPEC.md §3 dependency rules: which internal packages each package may import. */
const allowed = {
  cartridge: [],
  transport: [],
  vm: ['cartridge'],
  asm: ['cartridge'],
  qr: ['transport'],
};

const boundaryRules = Object.entries(allowed).map(([pkg, ok]) => {
  const forbidden = internal.filter((p) => p !== pkg && !ok.includes(p));
  return {
    files: [`packages/${pkg}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: forbidden.map((p) => `@qrc/${p}`), message: `SPEC §3: ${pkg} may import only [${ok.join(', ')}].` },
            { group: ['**/packages/*'], message: 'Import other packages by name (@qrc/...), not by path.' },
          ],
        },
      ],
    },
  };
});

/** Pure-logic packages must not touch Node built-ins or the DOM (their src only; tests may use Node). */
const pureRules = {
  files: ['packages/{cartridge,transport,vm,asm}/src/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['node:*', 'fs', 'path', 'zlib', 'crypto', 'os'], message: 'Pure packages must run anywhere: no Node built-ins.' },
          { group: internal.map((p) => `@qrc/${p}`).filter((g) => !['@qrc/cartridge'].includes(g)), message: 'SPEC §3 dependency rule.' },
          { group: ['**/packages/*'], message: 'Import other packages by name.' },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'demo/**', 'test-results/**', 'playwright-report/**', '.tmp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  ...boundaryRules,
  pureRules,
  // transport and cartridge: nothing internal at all (pureRules would allow @qrc/cartridge)
  ...['cartridge', 'transport'].map((pkg) => ({
    files: [`packages/${pkg}/src/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: internal.map((p) => `@qrc/${p}`), message: `SPEC §3: ${pkg} imports nothing internal.` },
            { group: ['node:*', 'fs', 'path', 'zlib', 'crypto', 'os'], message: 'No Node built-ins in pure src.' },
          ],
        },
      ],
    },
  })),
);
