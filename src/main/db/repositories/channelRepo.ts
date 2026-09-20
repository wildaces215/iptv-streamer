import type {
  Channel,
  ChannelDraft,
  ChannelListResult,
  ChannelQuery,
  GroupEntry,
  StreamKind
} from '@shared/types'
import { getDb } from '../client'

interface ChannelRow {
  id: number
  playlist_id: number | null
  name: string
  url: string
  group_name: string | null
  logo_url: string | null
  tvg_id: string | null
  tvg_name: string | null
  user_agent: string | null
  referrer: string | null
  kind: StreamKind | null
  needs_transcode: 0 | 1 | null
  probe_checked_at: number | null
  is_favorite: number
  is_hidden: number
  manual_override: number
  sort_order: number
  created_at: number
  updated_at: number
}

function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    name: row.name,
    url: row.url,
    groupName: row.group_name,
    logoUrl: row.logo_url,
    tvgId: row.tvg_id,
    tvgName: row.tvg_name,
    userAgent: row.user_agent,
    referrer: row.referrer,
    kind: row.kind,
    needsTranscode: row.needs_transcode,
    probeCheckedAt: row.probe_checked_at,
    isFavorite: row.is_favorite === 1,
    isHidden: row.is_hidden === 1,
    manualOverride: row.manual_override === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const SELECT = 'SELECT * FROM channels'

export function getChannel(id: number): Channel | null {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as ChannelRow | undefined
  return row ? toChannel(row) : null
}

export function getChannelByUrl(playlistId: number | null, url: string): Channel | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE playlist_id IS ? AND url = ?`)
    .get(playlistId, url) as ChannelRow | undefined
  return row ? toChannel(row) : null
}

export function listChannels(query: ChannelQuery): ChannelListResult {
  const where: string[] = ['is_hidden = 0']
  const params: unknown[] = []

  if (query.search) {
    // FTS5 query; user input is matched as a prefix-friendly term per word.
    const terms = query.search
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"*`)
      .join(' ')
    where.push('id IN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?)')
    params.push(terms)
  }
  if (query.group !== undefined) {
    where.push('group_name = ?')
    params.push(query.group)
  }
  if (query.playlistId !== undefined) {
    if (query.playlistId === null) {
      where.push('playlist_id IS NULL')
    } else {
      where.push('playlist_id = ?')
      params.push(query.playlistId)
    }
  }
  if (query.favoritesOnly) {
    where.push('is_favorite = 1')
  }

  const whereSql = `WHERE ${where.join(' AND ')}`
  const db = getDb()
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM channels ${whereSql}`).get(...params) as { c: number }
  ).c
  const rows = db
    .prepare(
      `${SELECT} ${whereSql} ORDER BY sort_order, name COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...params, query.limit ?? 200, query.offset ?? 0) as ChannelRow[]

  return { items: rows.map(toChannel), total }
}

export function createChannel(input: {
  playlistId?: number | null
  name: string
  url: string
  groupName?: string | null
  logoUrl?: string | null
  manualOverride?: boolean
  tvgId?: string | null
  tvgName?: string | null
  userAgent?: string | null
  referrer?: string | null
}): Channel {
  const now = Date.now()
  const info = getDb()
    .prepare(
      `INSERT INTO channels
         (playlist_id, name, url, group_name, logo_url, tvg_id, tvg_name,
          user_agent, referrer, manual_override, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.playlistId ?? null,
      input.name,
      input.url,
      input.groupName ?? null,
      input.logoUrl ?? null,
      input.tvgId ?? null,
      input.tvgName ?? null,
      input.userAgent ?? null,
      input.referrer ?? null,
      input.manualOverride ? 1 : 0,
      now,
      now
    )
  return getChannel(Number(info.lastInsertRowid)) as Channel
}

export function updateChannel(
  id: number,
  patch: {
    name?: string
    url?: string
    groupName?: string | null
    logoUrl?: string | null
    isHidden?: boolean
    sortOrder?: number
    markManualOverride?: boolean
  }
): Channel | null {
  const existing = getChannel(id)
  if (!existing) return null
  const merged = {
    name: patch.name ?? existing.name,
    url: patch.url ?? existing.url,
    group_name: patch.groupName !== undefined ? patch.groupName : existing.groupName,
    logo_url: patch.logoUrl !== undefined ? patch.logoUrl : existing.logoUrl,
    is_hidden: (patch.isHidden !== undefined ? patch.isHidden : existing.isHidden) ? 1 : 0,
    sort_order: patch.sortOrder ?? existing.sortOrder
  }
  const manualOverride =
    existing.manualOverride || patch.markManualOverride ? 1 : existing.manualOverride ? 1 : 0
  getDb()
    .prepare(
      `UPDATE channels
       SET name = ?, url = ?, group_name = ?, logo_url = ?, is_hidden = ?,
           manual_override = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      merged.name,
      merged.url,
      merged.group_name,
      merged.logo_url,
      merged.is_hidden,
      manualOverride,
      Date.now(),
      id
    )
  return getChannel(id)
}

export function setChannelFavorite(id: number, value: boolean): Channel | null {
  getDb()
    .prepare('UPDATE channels SET is_favorite = ?, updated_at = ? WHERE id = ?')
    .run(value ? 1 : 0, Date.now(), id)
  return getChannel(id)
}

export function deleteChannel(id: number): boolean {
  const info = getDb().prepare('DELETE FROM channels WHERE id = ?').run(id)
  return info.changes > 0
}

export function listGroups(playlistId?: number): GroupEntry[] {
  if (playlistId) {
    return getDb()
      .prepare(
        'SELECT name, channel_count AS count FROM v_groups WHERE playlist_id = ? ORDER BY name COLLATE NOCASE'
      )
      .all(playlistId) as GroupEntry[]
  }
  return getDb()
    .prepare(
      'SELECT name, SUM(channel_count) AS count FROM v_groups GROUP BY name ORDER BY name COLLATE NOCASE'
    )
    .all() as GroupEntry[]
}

export function saveProbeResult(
  channelId: number,
  kind: StreamKind,
  needsTranscode: boolean
): void {
  getDb()
    .prepare(
      'UPDATE channels SET kind = ?, needs_transcode = ?, probe_checked_at = ? WHERE id = ?'
    )
    .run(kind, needsTranscode ? 1 : 0, Date.now(), channelId)
}

/**
 * Upsert an imported draft against (playlist_id, url). Never clobbers
 * user-edited rows (manual_override = 1) or favorite flags.
 */
export function upsertImportedDrafts(
  playlistId: number,
  drafts: ChannelDraft[],
  pruneMissing: boolean
): { inserted: number; updated: number; skipped: number; pruned: number } {
  const db = getDb()
  const now = Date.now()

  const upsert = db.prepare(
    `INSERT INTO channels
       (playlist_id, name, url, group_name, logo_url, tvg_id, tvg_name,
        user_agent, referrer, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(playlist_id, url) DO UPDATE SET
       name       = excluded.name,
       group_name = excluded.group_name,
       logo_url   = excluded.logo_url,
       tvg_id     = excluded.tvg_id,
       tvg_name   = excluded.tvg_name,
       user_agent = excluded.user_agent,
       referrer   = excluded.referrer,
       updated_at = excluded.updated_at
     WHERE channels.manual_override = 0`
  )
  const findUrl = db.prepare('SELECT manual_override FROM channels WHERE playlist_id = ? AND url = ?')

  let inserted = 0
  let updated = 0
  let skipped = 0

  const prunedCount = db.transaction((): number => {
    for (const draft of drafts) {
      const existing = findUrl.get(playlistId, draft.url) as { manual_override: number } | undefined
      const info = upsert.run(
        playlistId,
        draft.name,
        draft.url,
        draft.groupName,
        draft.logoUrl,
        draft.tvgId,
        draft.tvgName,
        draft.userAgent,
        draft.referrer,
        0,
        now,
        now
      )
      if (info.changes === 0) {
        skipped++ // row exists but manual_override = 1
      } else if (existing) {
        updated++
      } else {
        inserted++
      }
    }
    if (pruneMissing) {
      const tempName = `import_urls_${Date.now()}`
      db.exec(`CREATE TEMP TABLE ${tempName} (url TEXT PRIMARY KEY)`)
      const insertUrl = db.prepare(`INSERT OR IGNORE INTO ${tempName} (url) VALUES (?)`)
      for (const draft of drafts) insertUrl.run(draft.url)
      const prune = db.prepare(
        `DELETE FROM channels
         WHERE playlist_id = ?
           AND manual_override = 0
           AND url NOT IN (SELECT url FROM ${tempName})`
      )
      const pruneInfo = prune.run(playlistId)
      db.exec(`DROP TABLE ${tempName}`)
      return pruneInfo.changes
    }
    return 0
  })()

  return { inserted, updated, skipped, pruned: prunedCount }
}