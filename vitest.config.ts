import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Map #root/* to ./src/* so tests import uncompiled TypeScript directly
    // (mirrors the package.json "imports" mapping used at runtime)
    alias: {
      '#root/': resolve(import.meta.dirname || new URL('.', import.meta.url).pathname, 'src') + '/',
    },
    // Allow .js extension imports to resolve to .ts sources (NodeNext compat)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**'],
    },
  },
})
