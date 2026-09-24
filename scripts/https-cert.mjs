// Creates a self-signed certificate for `npm run preview:https` in .tmp/cert (once). The phone must accept the
// certificate warning once; camera and service worker then work because the page is a secure context.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '../.tmp/cert');
if (existsSync(join(dir, 'cert.pem'))) {
  console.log(`using existing certificate in ${dir}`);
} else {
  mkdirSync(dir, { recursive: true });
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4').map((i) => i.address);
  const san = ['DNS:localhost', ...ips.map((ip) => `IP:${ip}`)].join(',');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    '-subj', '/CN=qr-console-dev', '-addext', `subjectAltName=${san}`,
  ], { stdio: 'inherit' });
  console.log(`created self-signed certificate for ${san}`);
}
