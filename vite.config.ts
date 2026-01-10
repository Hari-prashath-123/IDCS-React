import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      // Proxy Supabase auth endpoints to avoid CORS in dev
      '^/supabase-auth/.*': {
        target: process.env.VITE_SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/supabase-auth/, '/auth/v1'),
      },
      // Proxy Supabase REST endpoints
      '^/supabase-rest/.*': {
        target: process.env.VITE_SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/supabase-rest/, '/rest/v1'),
      },
      // Proxy Supabase Storage endpoints (avoid rest rewrite collision)
      '^/supabase-storage/.*': {
        target: process.env.VITE_SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/supabase-storage/, '/storage/v1'),
      },
    },
  },
});
