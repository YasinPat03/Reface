import { build } from 'vite';

await build({
  configFile: false,
  build: {
    target: 'es2022',
    lib: { entry: 'supabase/functions/reface-catalogue/index.ts', formats: ['es'] },
    outDir: 'node_modules/.cache/reface-catalogue',
    emptyOutDir: false,
    minify: true,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
});
