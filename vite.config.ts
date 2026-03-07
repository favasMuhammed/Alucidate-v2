import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Return 'vendor' for any node_modules, except handle large ones separately if needed
              if (id.includes('pdfjs-dist')) return 'pdfjs';
              if (id.includes('@google/genai')) return 'genai';
              if (id.includes('gsap')) return 'gsap';
              if (id.includes('react')) return 'react-vendor';
              return 'vendor'; // all other node_modules
            }
          }
        }
      }
    }
  };
});
