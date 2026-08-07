import { describe, it, expect } from 'vitest'
import { sniffMimeType } from '@/lib/attachments/sniffMimeType'

describe('sniffMimeType', () => {
  it('detects JPEG from magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(sniffMimeType(buf)).toBe('image/jpeg')
  })

  it('detects PNG from magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMimeType(buf)).toBe('image/png')
  })

  it('detects PDF from magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4', 'ascii')
    expect(sniffMimeType(buf)).toBe('application/pdf')
  })

  it('returns null for an unrecognized/spoofed file (e.g. an HTML file renamed to .pdf)', () => {
    const buf = Buffer.from('<html><script>alert(1)</script></html>', 'ascii')
    expect(sniffMimeType(buf)).toBeNull()
  })

  it('returns null for an empty buffer', () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull()
  })
})
