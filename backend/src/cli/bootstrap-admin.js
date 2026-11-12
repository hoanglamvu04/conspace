import { createInterface } from 'node:readline';
import { stdin } from 'node:process';
import { pool, closeDatabase } from '../database/pool.js';
import { createAuthService } from '../services/auth.js';

function readArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) values[args[index].slice(2)] = args[index + 1];
  }
  return values;
}

async function readPasswordFromStdin() {
  let value = '';
  for await (const chunk of stdin) value += chunk;
  return value.replace(/[\r\n]+$/, '');
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (!args.email || !args.name || !process.argv.includes('--password-stdin')) {
    throw new Error('Usage: npm run cms:bootstrap-admin -- --email admin@example.com --name "Editor" --password-stdin < password.txt');
  }
  const password = await readPasswordFromStdin();
  if (password.length < 14 || password.length > 256) {
    throw new Error('Bootstrap password must contain 14-256 characters');
  }
  const result = await createAuthService(pool).bootstrapAdmin({
    email: args.email, displayName: args.name, password,
  });
  process.stdout.write('CMS bootstrap admin created: ' + result.email + ' (' + result.role + ')\\n');
}

main().catch((error) => {
  process.stderr.write('CMS bootstrap failed: ' + (error.message || 'unknown error') + '\\n');
  process.exitCode = 1;
}).finally(() => closeDatabase());
