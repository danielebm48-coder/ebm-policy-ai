import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'app'),
  publicDir: path.resolve(__dirname, 'app/public'),
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
});
