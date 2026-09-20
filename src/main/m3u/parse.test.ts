import { describe, expect, it } from 'vitest'
import { parseM3u, parseM3uFallback, deriveNameFromUrl } from './parse'
import type { ChannelDraft } from '@shared/types'

// iptv-playlist-parser is bundled/external in main, but for vitest we test
// the fallback parser + helper logic directly (the wrapper is thin glue).
const BASIC = `#EXTM3U x-tvg-url="http://epg.example.com/gz"
#EXTINF:-1 tvg-id="bbc.news" tvg-logo="http://logo/bbc.png" group-title="News",BBC News
http://stream.example.com/bbc.m3u8
#EXTINF:-1 group-title="Sports", ESPN
#EXTVLCOPT:http-user-agent=MyAgent/1.0
#EXTVLCOPT:http-referrer=http://referrer.example.com
http://stream.example.com/espn.ts
#EXTINF:-1,Movie: Night, Late
http://stream.example.com/movie.mp4
`

describe('parseM3uFallback', () => {
  it('parses header attributes, groups, logos and names', () => {
    const { epgUrl, drafts } = parseM3uFallback(BASIC)
    expect(epgUrl).toBe('http://epg.example.com/gz')
    expect(drafts[0].name).toBe('BBC News')
    expect(drafts[0].groupName).toBe('News')
    expect(drafts[0].logoUrl).toBe('http://logo/bbc.png')
    expect(drafts[0].tvgId).toBe('bbc.news')
  })

  it('keeps names containing commas intact', () => {
    const { drafts } = parseM3uFallback(BASIC)
    expect(drafts[2].name).toBe('Movie: Night, Late')
  })

  it('reads #EXTVLCOPT overrides attached to the following URL', () => {
    const { drafts } = parseM3uFallback(BASIC)
    expect(drafts[1].userAgent).toBe('MyAgent/1.0')
    expect(drafts[1].referrer).toBe('http://referrer.example.com')
  })

  it('handles CRLF and BOM', () => {
    const crlf = '﻿#EXTM3U\r\n#EXTINF:-1,Test\r\nhttp://x/y.m3u8\r\n'
    const { drafts } = parseM3uFallback(crlf)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].name).toBe('Test')
  })

  it('derives a name when #EXTINF name is empty', () => {
    const { drafts } = parseM3uFallback('#EXTM3U\n#EXTINF:-1,\nhttp://x/some%20Cool%20Stream.ts\n')
    expect(drafts[0].name).toBe('some Cool Stream')
  })

  it('dedupes by URL', () => {
    const { drafts } = parseM3uFallback(
      '#EXTM3U\n#EXTINF:-1,A\nhttp://x/same.m3u8\n#EXTINF:-1,B\nhttp://x/same.m3u8\n'
    )
    expect(drafts).toHaveLength(1)
  })

  it('handles bare-URL m3u files', () => {
    const { drafts } = parseM3uFallback('http://x/a.ts\nhttp://x/b.ts\n')
    expect(drafts).toHaveLength(2)
    expect(drafts[1].name).toBe('b')
  })
})

describe('parseM3u (library wrapper)', () => {
  it('parses the basic playlist into drafts', () => {
    const parsed: ReturnType<typeof parseM3u> = parseM3u(BASIC)
    expect(parsed.epgUrl).toBe('http://epg.example.com/gz')
    const names = parsed.drafts.map((d: ChannelDraft) => d.name)
    expect(names).toContain('BBC News')
  })

  it('throws InvalidPlaylistError on non-M3U text', () => {
    expect(() => parseM3u('<html><body>404</body></html>')).toThrow(/valid M3U/)
  })
})

describe('deriveNameFromUrl', () => {
  it('extracts, decodes and strips the extension', () => {
    expect(deriveNameFromUrl('http://h.com/path/My%20Channel.ts?x=1')).toBe('My Channel')
  })
  it('falls back to hostname for bare-host URLs', () => {
    expect(deriveNameFromUrl('http://streamer.tv/')).toBe('streamer.tv')
  })
})