/** Pure HLS-manifest rewriting — no electron/node server imports, unit-testable. */

function proxify(uri: string, baseUrl: URL): string {
  if (uri.startsWith('/proxy?')) return uri
  let absolute: URL
  try {
    absolute = new URL(uri, baseUrl)
  } catch {
    return uri
  }
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return uri
  return `/proxy?url=${encodeURIComponent(absolute.toString())}`
}

/**
 * Rewrite an HLS manifest so every URI it references (segments, keys, media
 * renditions, maps, parts, i-frames) is absolute and routed through /proxy.
 */
export function rewriteManifest(body: string, baseUrl: URL): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${proxify(uri, baseUrl)}"`)
      }
      return proxify(trimmed, baseUrl)
    })
    .join('\n')
}