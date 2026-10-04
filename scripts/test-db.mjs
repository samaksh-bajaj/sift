import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const name = `sift-test-${process.pid}`;
const docker = (args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-v',
    `${path.resolve('supabase')}:/tests:ro`,
    process.env.TEST_POSTGRES_IMAGE ?? 'pgvector/pgvector:pg16',
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      docker(['exec', name, 'pg_isready', '-U', 'postgres']);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ready) throw new Error('Test database did not start');
  const migrations = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const args = [
    'exec',
    name,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '/tests/tests/bootstrap.sql',
    ...migrations.flatMap((f) => ['-f', `/tests/migrations/${f}`]),
    '-f',
    '/tests/tests/rls.sql',
  ];
  console.log(docker(args).trim());
} finally {
  try {
    docker(['stop', name]);
  } catch {
    /* A failed container start leaves nothing to stop. */
  }
}
