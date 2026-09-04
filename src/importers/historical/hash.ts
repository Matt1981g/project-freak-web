function bytes_to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function sha256_hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytes_to_hex(new Uint8Array(digest))
}

export async function sha256_text(value: string): Promise<string> {
  return sha256_hex(new TextEncoder().encode(value))
}

export async function deterministic_uuid(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  const bytes = new Uint8Array(digest).slice(0, 16)

  // UUIDv8: custom deterministic payload, RFC 9562 variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes_to_hex(bytes)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
