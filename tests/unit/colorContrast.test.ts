import { describe, it, expect } from 'vitest'

function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// 10%-opacity flat blend of `fg` over `bg` — matches Tailwind's `/10` badge
// idiom (e.g. `bg-success/10`), this app's tightest real success/warning
// text background, lighter than the app's own paper background.
function blend(fg: string, bg: string, alpha: number): string {
  const fgR = parseInt(fg.slice(1, 3), 16)
  const fgG = parseInt(fg.slice(3, 5), 16)
  const fgB = parseInt(fg.slice(5, 7), 16)
  const bgR = parseInt(bg.slice(1, 3), 16)
  const bgG = parseInt(bg.slice(3, 5), 16)
  const bgB = parseInt(bg.slice(5, 7), 16)
  const mix = (f: number, b: number) => Math.round(b * (1 - alpha) + f * alpha)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(fgR, bgR))}${toHex(mix(fgG, bgG))}${toHex(mix(fgB, bgB))}`
}

const PAPER = '#f8fafc'
const WHITE = '#ffffff'
const SUCCESS = '#166534'
const WARNING = '#92400e'

describe('success/warning token contrast (WCAG AA, 4.5:1)', () => {
  it('success text passes against the app paper background', () => {
    expect(contrastRatio(SUCCESS, PAPER)).toBeGreaterThanOrEqual(4.5)
  })
  it('success text passes against its own /10 badge background (tightest real case)', () => {
    expect(contrastRatio(SUCCESS, blend(SUCCESS, WHITE, 0.1))).toBeGreaterThanOrEqual(4.5)
  })
  it('warning text passes against the app paper background', () => {
    expect(contrastRatio(WARNING, PAPER)).toBeGreaterThanOrEqual(4.5)
  })
  it('warning text passes against its own /10 badge background (tightest real case)', () => {
    expect(contrastRatio(WARNING, blend(WARNING, WHITE, 0.1))).toBeGreaterThanOrEqual(4.5)
  })
})
