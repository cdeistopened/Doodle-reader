import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // RSS feed proxy (rss-proxy.js on port 3002)
          '/api/feed': {
            target: 'http://localhost:3002',
            changeOrigin: true,
            rewrite: (path) => path.replace('/api/feed', '/feed'),
          },
          // YouTube transcript + audio proxy (api-server.js on port 3001)
          '/api/youtube': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/api/audio': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
