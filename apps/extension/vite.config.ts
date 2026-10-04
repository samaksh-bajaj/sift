import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_SUPABASE_URL
    ? new URL(env.VITE_SUPABASE_URL).origin
    : 'http://127.0.0.1:54321';
  return {
    plugins: [
      react(),
      {
        name: 'extension-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: JSON.stringify(
              {
                manifest_version: 3,
                name: 'Sift',
                version: '0.1.0',
                description:
                  'Save a page into a private, source-backed comparison.',
                permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
                host_permissions: [`${backend}/*`],
                action: { default_title: 'Save to Sift' },
                side_panel: { default_path: 'index.html' },
                background: { service_worker: 'background.js', type: 'module' },
                content_security_policy: {
                  extension_pages: "script-src 'self'; object-src 'self'",
                },
              },
              null,
              2,
            ),
          });
        },
      },
    ],
    build: { outDir: 'dist' },
  };
});
