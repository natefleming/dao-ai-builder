import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  // Vite automatically loads .env files
  // VITE_DATABRICKS_HOST and VITE_DATABRICKS_TOKEN are available via import.meta.env
  envPrefix: 'VITE_',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})

