const SIGNATURES: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'; bytes: number[] }> = [
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
]

export function sniffMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue
    if (sig.bytes.every((byte, i) => buffer[i] === byte)) return sig.mimeType
  }
  return null
}
