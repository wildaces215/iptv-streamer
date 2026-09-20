import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { MIGRATIONS } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not opened — call openDb() first')
  return db
}

export function openDb(): Database.Database {
  if (db) return db
  const file = path.join(app.getPath('userData'), 'iptv.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  migrate(db)
  return db
}

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    db.transaction(() => {
      db.exec(migration.up)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
}

export function closeDb(): void {
  if (!db) return
  db.close()
  db = null
}