import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/env.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Every integration file's beforeAll calls resetEmulator(), an
    // unscoped whole-database wipe (tests/setup/fixtures.ts) — safe when
    // files run one at a time, but under Vitest's default file-level
    // concurrency a later file's reset can wipe an earlier file's
    // already-seeded data mid-run. Phase 30.1 reproduced this
    // deterministically (getLabRecords.test.ts: 4/4 passing alone, 3/4
    // failing when scheduled alongside attachments.test.ts) — this is the
    // same bug class CLAUDE.md's Phase 23 process note already documents,
    // now fixed at the root instead of worked around per-file.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
