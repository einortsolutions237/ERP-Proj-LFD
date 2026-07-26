import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readGlobalsCss(): string {
  return readFileSync(join(__dirname, '..', '..', 'src', 'app', 'globals.css'), 'utf8')
}

describe('Phase 38.1 design tokens exist in globals.css', () => {
  const css = readGlobalsCss()
  const expectedTokens = ['--radius-card', '--radius-control', '--radius-badge', '--shadow-card-hover', '--shadow-popover']

  for (const token of expectedTokens) {
    it(`defines ${token}`, () => {
      const re = new RegExp(`${token}:\\s*\\S+`)
      expect(css).toMatch(re)
    })
  }
})
