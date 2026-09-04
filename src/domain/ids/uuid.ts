let fallback_counter = 0

function bytes_to_uuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

function fill_fallback_bytes(bytes: Uint8Array): void {
  const now = Date.now()
  const counter = fallback_counter++

  for (let index = 0; index < bytes.length; index += 1) {
    const time_byte = (now >>> ((index % 6) * 8)) & 0xff
    const counter_byte = (counter >>> ((index % 4) * 8)) & 0xff
    const random_byte = Math.floor(Math.random() * 256)
    bytes[index] = time_byte ^ counter_byte ^ random_byte
  }
}

export function create_uuid(): string {
  const crypto_api = globalThis.crypto

  if (typeof crypto_api?.randomUUID === 'function') {
    return crypto_api.randomUUID()
  }

  const bytes = new Uint8Array(16)

  if (typeof crypto_api?.getRandomValues === 'function') {
    crypto_api.getRandomValues(bytes)
  } else {
    fill_fallback_bytes(bytes)
  }

  return bytes_to_uuid(bytes)
}
