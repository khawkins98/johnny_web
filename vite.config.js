import { defineConfig } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const buildId =
    process.env.VITE_BUILD_ID ||
    (() => {
        try {
            return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    })();

const dgdsTracePlugin = () => {
    let traceSequence = 0;
    return {
        name: 'dgds-trace-writer',
        configureServer(server) {
            server.middlewares.use('/__dgds_trace', (request, response, next) => {
                if (request.method !== 'POST') return next();
                const chunks = [];
                request.on('data', (chunk) => chunks.push(chunk));
                request.on('end', async () => {
                    try {
                        const traceDir = path.resolve(process.cwd(), 'traces');
                        await mkdir(traceDir, { recursive: true });
                        const traceId = request.headers['x-dgds-trace-id'];
                        const safeTraceId =
                            typeof traceId === 'string' ? traceId.replaceAll(/[^a-zA-Z0-9_.-]/g, '') : '';
                        const suffix = String(traceSequence++).padStart(4, '0');
                        const filename = safeTraceId
                            ? `${safeTraceId}.jsonl`
                            : `dgds-${new Date().toISOString().replaceAll(':', '-')}-${suffix}.jsonl`;
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
    };
};

export default defineConfig({
    base: process.env.VITE_BASE_PATH ?? '/',
    publicDir: process.env.VITE_EMPTY_PUBLIC ? false : 'public',
    plugins: [dgdsTracePlugin()],
    define: {
        __BOTTLE_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
        __BOTTLE_BUILD__: JSON.stringify(buildId),
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.mjs', 'test/faithfulness-diff.mjs'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.mjs'],
            exclude: ['src/**/*.test.mjs', 'src/extract.mjs', 'src/dump.mjs'],
        },
    },
});
