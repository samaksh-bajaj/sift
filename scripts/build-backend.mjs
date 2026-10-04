import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
await build({
  entryPoints: ['packages/shared/src/backend.ts'],
  outfile: 'supabase/functions/_shared/domain.js',
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  external: ['zod'],
});
writeFileSync(
  'supabase/functions/_shared/domain.d.ts',
  "export * from '../../../../packages/shared/src/backend.ts';\n",
);
