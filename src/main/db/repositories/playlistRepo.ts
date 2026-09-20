import type { Playlist, PlaylistSourceType } from '@shared/types'
import { getDb } from '../client'

interface PlaylistRow {
  id: number
  name: string
  source_type: PlaylistSourceType
  source_url: string | null
  source_path: string | null
  epg_url: string | null
  user_agent: string | null
  channel_count: number
  last_imported_at: number | null
  created_at: number
  updated_at: number
}

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourcePath: row.source_path,
    epgUrl: row.epg_url,
    userAgent: row.user_agent,
    channelCount: row.channel_count,
    lastImportedAt: row.last_imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listPlaylists(): Playlist[] {
  return (getDb().prepare('SELECT * FROM playlists ORDER BY name COLLATE NOCASE').all() as PlaylistRow[]).map(
    toPlaylist
  )
}

export function getPlaylist(id: number): Playlist | null {
  const row = getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(id) as
    | PlaylistRow
    | undefined
  return row ? toPlaylist(row) : null
}

export function getPlaylistByName(name: string): Playlist | null {
  const row = getDb().prepare('SELECT * FROM playlists WHERE name = ?').get(name) as
    | PlaylistRow
    | undefined
  return row ? toPlaylist(row) : null
}

export function createPlaylist(input: {
  name: string
  sourceType: PlaylistSourceType
  sourceUrl?: string | null
  sourcePath?: string | null
  epgUrl?: string | null
  userAgent?: string | null
}): Playlist {
  const now = Date.now()
  const info = getDb()
    .prepare(
      `INSERT INTO playlists (name, source_type, source_url, source_path, epg_url, user_agent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.sourceType,
      input.sourceUrl ?? null,
      input.sourcePath ?? null,
      input.epgUrl ?? null,
      input.userAgent ?? null,
      now,
      now
    )
  return getPlaylist(Number(info.lastInsertRowid)) as Playlist
}

export function updatePlaylist(
  id: number,
  patch: { name?: string; epgUrl?: string | null; userAgent?: string | null }
): Playlist | null {
  const existing = getPlaylist(id)
  if (!existing) return null
  getDb()
    .prepare(
      `UPDATE playlists
       SET name = ?, epg_url = ?, user_agent = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.epgUrl !== undefined ? patch.epgUrl : existing.epgUrl,
      patch.userAgent ?? existing.userAgent,
      Date.now(),
      id
    )
  return getPlaylist(id)
}

/** Update import bookkeeping; used by importPlaylist. */
export function touchPlaylistImported(id: number, epgUrl: string | null, userAgent: string | null): void {
  getDb()
    .prepare(
      `UPDATE playlists
       SET epg_url = COALESCE(?, epg_url),
           user_agent = COALESCE(?, user_agent),
           channel_count = (SELECT COUNT(*) FROM channels WHERE playlist_id = ?),
           last_imported_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .run(epgUrl, userAgent, id, Date.now(), Date.now(), id)
}

export function deletePlaylist(id: number): number {
  const row = getDb().prepare('SELECT channel_count FROM playlists WHERE id = ?').get(id) as
    | { channel_count: number }
    | undefined
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id)
  return row?.channel_count ?? 0
}