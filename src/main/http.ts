import { request } from 'undici'
import type { Dispatcher } from 'undici'

/**
 * undici's `request` no longer supports `maxRedirections` — follow
 * redirects manually so playlist/proxy fetches survive 3xx hops.
 */
export async function requestFollowingRedirects(
  url: string,
  opts: Parameters<typeof request>[1],
  maxRedirects = 5
): Promise<Awaited<ReturnType<typeof request>>> {
  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await request(current as unknown as string, opts as Dispatcher.RequestOptions)
    const location = response.headers.location
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      response.body.destroy()
      current = new URL(String(location), current).toString()
      continue
    }
    return response
  }
  throw new Error(`Too many redirects fetching ${url}`)
}