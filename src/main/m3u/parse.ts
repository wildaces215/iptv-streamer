import parser from 'iptv-playlist-parser'
import type { ChannelDraft } from '@shared/types'

export interface ParsedPlaylist {
  epgUrl: string | null
  drafts: ChannelDraft[]
  duplicateCount: number
}

export class InvalidPlaylistError extends Error {
  constructor(message = 'Not a valid M3U playlist — no #EXTM3U header or #EXTINF entries found') {
    super(message)
    this.name = 'InvalidPlaylistError'
  }
}

/** Derive a display name from a URL when the playlist has an empty #EXTINF name. */
export function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const segment = parsed.pathname.split('/').filter(Boolean).pop()
    if (!segment) return parsed.hostname
    return decodeURIComponent(segment).replace(/\.[a-z0-9]{1,5}$/i, '') || parsed.hostname
  } catch {
    return url
  }
}

function draftFromItem(item: ReturnType<typeof parser.parse>['items'][number]): ChannelDraft {
  const url = item.url.trim()
  return {
    name: item.name?.trim() || deriveNameFromUrl(url),
    url,
    groupName: item.group?.title?.trim() || null,
    logoUrl: item.tvg?.logo?.trim() || null,
    tvgId: item.tvg?.id?.trim() || null,
    tvgName: item.tvg?.name?.trim() || null,
    userAgent: item.http?.['user-agent']?.trim() || null,
    referrer: item.http?.referrer?.trim() || null
  }
}

export function parseM3u(text: string): ParsedPlaylist {
  const bomStripped = text.replace(/^﻿/, '')
  const looksLikeM3U = bomStripped.includes('#EXTM3U') || bomStripped.includes('#EXTINF')
  if (!looksLikeM3U) throw new InvalidPlaylistError()

  const parsed = parser.parse(bomStripped)
  const headerAttrs = (parsed.header as unknown as { attrs?: Record<string, string> } | undefined)?.attrs
  const epgUrl = headerAttrs?.['x-tvg-url']?.trim() || null

  const drafts: ChannelDraft[] = []
  const seen = new Set<string>()
  let duplicates = 0
  for (const item of parsed.items) {
    if (!item.url?.trim()) continue
    const url = item.url.trim()
    if (seen.has(url)) {
      duplicates++
      continue
    }
    seen.add(url)
    drafts.push(draftFromItem(item))
  }

  return { epgUrl, drafts, duplicateCount: duplicates }
}

/**
 * Minimal fallback parser, used if iptv-playlist-parser is unavailable or
 * misparses. Handles: #EXTM3U attrs, #EXTINF with quoted attrs and commas in
 * names, #EXTGRP:, #EXTVLCOPT:http-user-agent/-referrer, CRLF, BOM.
 */
export function parseM3uFallback(text: string): ParsedPlaylist {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const drafts: ChannelDraft[] = []
  const seen = new Set<string>()
  let epgUrl: string | null = null

  let pending: Partial<ChannelDraft> | null = null
  const attrRegex = /([a-zA-Z0-9-]+)="([^"]*)"/g

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#EXTM3U')) {
      const attrs = Object.fromEntries([...line.slice(7).matchAll(attrRegex)].map((m) => [m[1], m[2]]))
      epgUrl = attrs['x-tvg-url'] || attrs['url-tvg'] || null
      continue
    }
    if (line.startsWith('#EXTINF')) {
      const match = line.match(/^#EXTINF:\s*[^,]*,(.*)$/)
      const attrs = Object.fromEntries([...line.matchAll(attrRegex)].map((m) => [m[1], m[2]]))
      pending = {
        name: match?.[1]?.trim() || '',
        groupName: attrs['group-title'] || null,
        logoUrl: attrs['tvg-logo'] || null,
        tvgId: attrs['tvg-id'] || null,
        tvgName: attrs['tvg-name'] || null,
        userAgent: null,
        referrer: null
      }
      continue
    }
    if (line.startsWith('#EXTVLCOPT')) {
      if (pending) {
        const ua = line.match(/#EXTVLCOPT:http-user-agent=(.*)/i)?.[1]?.trim()
        const ref = line.match(/#EXTVLCOPT:http-referrer=(.*)/i)?.[1]?.trim()
        if (ua) pending.userAgent = ua
        if (ref) pending.referrer = ref
      }
      continue
    }
    if (line.startsWith('#EXTGRP:')) {
      if (pending) pending.groupName = line.slice(8).trim() || null
      continue
    }
    if (line.startsWith('#')) continue

    // Non-comment line: a URL completing the pending entry (or a bare URL).
    if (seen.has(line)) continue
    seen.add(line)
    drafts.push({
      name: pending?.name?.trim() || deriveNameFromUrl(line),
      url: line,
      groupName: pending?.groupName ?? null,
      logoUrl: pending?.logoUrl ?? null,
      tvgId: pending?.tvgId ?? null,
      tvgName: pending?.tvgName ?? null,
      userAgent: pending?.userAgent ?? null,
      referrer: pending?.referrer ?? null
    })
    pending = null
  }

  return { epgUrl, drafts, duplicateCount: 0 }
}