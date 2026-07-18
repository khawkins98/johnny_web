import { defineConfig } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dgdsTracePlugin = () => ({
  name: 'dgds-trace-writer',
  configureServer(server) {
    server.middlewares.use('/__dgds_trace', (request, response, next) => {
      if (request.method !== 'POST') return next();
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', async () => {
        try {
          const traceDir = path.resolve(process.cwd(), 'traces');
          await mkdir(traceDir, { recursive: true });
          const filename = `dgds-${new Date().toISOString().replaceAll(':', '-')}.jsonl`;
          await writeFile(path.join(traceDir, filename), Buffer.concat(chunks));
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ path: `traces/${filename}` }));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: error.message }));
        }
      });
    });
  },
});

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  publicDir: 'public',
  plugins: [dgdsTracePlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.mjs'],
      exclude: ['src/**/*.test.mjs', 'src/extract.mjs', 'src/dump.mjs'],
    },
  },
});
