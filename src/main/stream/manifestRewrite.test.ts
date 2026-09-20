import { describe, expect, it } from 'vitest'
import { rewriteManifest } from './manifestRewrite'

describe('rewriteManifest', () => {
  it('rewrites relative segment URIs to absolute /proxy URLs', () => {
    const manifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
seg-001.ts
http://other.host/seg-002.ts
`
    const out = rewriteManifest(manifest, new URL('http://upstream.tv/live/ch1/index.m3u8'))
    expect(out).toContain(
      `/proxy?url=${encodeURIComponent('http://upstream.tv/live/ch1/seg-001.ts')}`
    )
    expect(out).toContain('/proxy?url=' + encodeURIComponent('http://other.host/seg-002.ts'))
    expect(out).toContain('#EXT-X-VERSION:3')
  })

  it('rewrites #EXT-X-KEY and #EXT-X-MAP URIs', () => {
    const manifest = [
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example/key.bin"',
      '#EXT-X-MAP:URI="init.mp4"'
    ].join('\n')
    const out = rewriteManifest(manifest, new URL('http://upstream.tv/live/ch1/index.m3u8'))
    expect(out).toContain(encodeURIComponent('https://keys.example/key.bin'))
    expect(out).toContain(encodeURIComponent('http://upstream.tv/live/ch1/init.mp4'))
  })

  it('leaves non-http URIs and already-proxied URIs untouched', () => {
    const manifest = '#EXT-X-KEY:METHOD=NONE,URI="data:text/plain,x"\n/proxy?url=x'
    const out = rewriteManifest(manifest, new URL('http://upstream.tv/index.m3u8'))
    expect(out).toContain('data:text/plain,x')
  })

  it('resolves relative paths with ../ segments', () => {
    const out = rewriteManifest('../seg.ts', new URL('http://h.tv/live/ch1/index.m3u8'))
    expect(out).toBe(`/proxy?url=${encodeURIComponent('http://h.tv/live/seg.ts')}`)
  })
})