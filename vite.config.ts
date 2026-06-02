import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'app'),
    publicDir: path.resolve(__dirname, 'app/public'),
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || env.API_URL || ''),
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': 'http://localhost:4001'
      }
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/app'),
      rollupOptions: {
        input: path.resolve(__dirname, 'app/index.html')
      }
    }
  };
});
