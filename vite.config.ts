import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'dist-companion/**', 'tests/e2e/**', 'companion/**'],
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/graphUtils.ts', 'src/store.ts', 'src/export.ts'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
})
