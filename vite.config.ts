import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

function createContext7DevPlugin(apiKey?: string): Plugin {
  return {
    name: 'context7-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/context7', async (req, res) => {
        if (!req.url) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing request URL' }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing CONTEXT7_API_KEY in local environment' }));
          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const upstreamUrl = new URL(
          requestUrl.pathname.endsWith('/search')
            ? 'https://context7.com/api/v2/libs/search'
            : 'https://context7.com/api/v2/context'
        );

        requestUrl.searchParams.forEach((value, key) => {
          if (requestUrl.pathname.endsWith('/context') && key === 'type' && value !== 'json' && value !== 'txt') {
            return;
          }

          upstreamUrl.searchParams.set(key, value);
        });

        try {
          const upstream = await fetch(upstreamUrl, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          });

          const payload = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
          res.end(payload);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'Failed to reach Context7 from Vite dev server',
              details: error instanceof Error ? error.message : 'Unknown error',
            })
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/',
    build: {
      sourcemap: true, // Enable sourcemap for debugging
    },
    plugins: [
      react(),
      tsconfigPaths(),
      createContext7DevPlugin(env.CONTEXT7_API_KEY),
    ],
  };
})
