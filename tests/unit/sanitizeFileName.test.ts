import { describe, it, expect } from 'vitest'
import { sanitizeFileName } from '@/lib/attachments/sanitizeFileName'

describe('sanitizeFileName', () => {
  it('passes through a normal filename unchanged', () => {
    expect(sanitizeFileName('lab-result-scan.pdf')).toBe('lab-result-scan.pdf')
  })

  it('strips path separators to prevent directory traversal in Content-Disposition', () => {
    // Only '/' and '\' are stripped (the characters that actually let a
    // path traverse) — the '.' characters in '..' are left alone since
    // dots are inert without a separator to walk through. '../../etc/passwd'
    // has 4 dots total ('..' + '..') and 3 slashes, so stripping the
    // slashes alone yields 4 dots followed by 'etcpasswd'.
    expect(sanitizeFileName('../../etc/passwd')).toBe('....etcpasswd')
  })

  it('strips double quotes that would break out of the quoted header value', () => {
    // '=' is not stripped — it carries no header-injection risk in a
    // Content-Disposition filename value once quotes/control chars are gone.
    expect(sanitizeFileName('evil".pdf; filename="x')).toBe('evil.pdf; filename=x')
  })

  it('strips control characters', () => {
    expect(sanitizeFileName('name\r\nSet-Cookie: evil=1.pdf')).toBe('nameSet-Cookie: evil=1.pdf')
  })

  it('truncates an excessively long filename', () => {
    const long = 'a'.repeat(500) + '.pdf'
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(255)
  })
})
