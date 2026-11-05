import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const developmentApiTarget = process.env.SHUANGHUA_DEV_API_TARGET ?? 'http://127.0.0.1:3002'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: developmentApiTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/]react(?:-dom|-router|-router-dom)?[\\/]/ },
            { name: 'ui', test: /node_modules[\\/](?:@radix-ui|lucide-react|sonner)[\\/]/ },
            { name: 'data', test: /node_modules[\\/](?:@tanstack|idb|zustand|zod)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
