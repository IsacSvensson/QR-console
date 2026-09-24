import { execFileSync } from 'node:child_process';

export default function globalSetup() {
  execFileSync('npx', ['tsx', 'e2e/make-fixtures.ts'], { stdio: 'inherit' });
}
