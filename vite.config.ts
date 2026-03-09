import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@google/genai')) return 'genai';
            if (id.includes('framer-motion') || id.includes('gsap')) return 'animations';
            if (id.includes('react-router') || id.includes('@tanstack') || id.includes('zustand')) return 'core-vendor';
            if (id.includes('katex') || id.includes('remark') || id.includes('rehype') || id.includes('markdown')) return 'markdown-vendor';
            return 'vendor';
          }
        },
      },
    },
  },
});
