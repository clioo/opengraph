import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['companion/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'dist-companion/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['companion/**/*.ts', 'src/companion/document.ts'],
    },
  },
})
