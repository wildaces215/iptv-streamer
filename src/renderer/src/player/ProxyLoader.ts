import Hls from 'hls.js'

/**
 * hls.js loader that routes every manifest/fragment request through the
 * main-process loopback proxy, which adds CORS headers and spoofed
 * UA/Referer that the upstream would otherwise require.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export class ProxyLoader extends Hls.DefaultConfig.loader {
  load(context: any, config: any, callbacks: any): void {
    if (context?.url) context.url = toProxyUrl(context.url)
    super.load(context, config, callbacks)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function toProxyUrl(url: string): string {
  if (url.includes('/proxy?url=')) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return url
    return `${window.location.protocol}//${window.location.host}/proxy?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}