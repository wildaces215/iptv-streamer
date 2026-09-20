import { getDb } from '../client'

export function getSetting(key: string): unknown {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value ?? null))
}