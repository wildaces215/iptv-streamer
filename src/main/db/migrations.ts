export const MIGRATIONS: { version: number; up: string }[] = [
  {
    version: 1,
    up: `
CREATE TABLE playlists (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  source_type     TEXT    NOT NULL CHECK (source_type IN ('url','file','manual')),
  source_url      TEXT,
  source_path     TEXT,
  epg_url         TEXT,
  user_agent      TEXT,
  channel_count   INTEGER NOT NULL DEFAULT 0,
  last_imported_at INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_playlists_name ON playlists(name);

CREATE TABLE channels (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id      INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  group_name       TEXT,
  logo_url         TEXT,
  tvg_id           TEXT,
  tvg_name         TEXT,
  user_agent       TEXT,
  referrer         TEXT,
  kind             TEXT CHECK (kind IN ('hls','ts','other')),
  needs_transcode  INTEGER,
  probe_checked_at INTEGER,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  is_hidden        INTEGER NOT NULL DEFAULT 0,
  manual_override  INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_channels_playlist_url ON channels(playlist_id, url);
CREATE INDEX idx_channels_playlist ON channels(playlist_id, group_name, sort_order);
CREATE INDEX idx_channels_group    ON channels(group_name);
CREATE INDEX idx_channels_name     ON channels(name);
CREATE INDEX idx_channels_favorite ON channels(is_favorite);

CREATE VIRTUAL TABLE channels_fts USING fts5(name, group_name, content='channels', content_rowid='id');
CREATE TRIGGER channels_ai AFTER INSERT ON channels BEGIN
  INSERT INTO channels_fts(rowid, name, group_name)
  VALUES (new.id, new.name, coalesce(new.group_name, ''));
END;
CREATE TRIGGER channels_ad AFTER DELETE ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name, group_name)
  VALUES ('delete', old.id, old.name, coalesce(old.group_name, ''));
END;
CREATE TRIGGER channels_au AFTER UPDATE OF name, group_name ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name, group_name)
  VALUES ('delete', old.id, old.name, coalesce(old.group_name, ''));
  INSERT INTO channels_fts(rowid, name, group_name)
  VALUES (new.id, new.name, coalesce(new.group_name, ''));
END;

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE watch_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  mode       TEXT,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);
CREATE INDEX idx_history_channel ON watch_history(channel_id, started_at DESC);

CREATE VIEW v_groups AS
  SELECT playlist_id, group_name AS name, COUNT(*) AS channel_count
  FROM channels
  WHERE group_name IS NOT NULL AND is_hidden = 0
  GROUP BY playlist_id, group_name
  ORDER BY name COLLATE NOCASE;
`
  }
]