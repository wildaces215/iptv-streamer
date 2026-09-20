import * as React from 'react'
import { FileText, Globe } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import type { ImportPreview, ImportResult } from '@shared/types'
import { toast } from './Toasts'

type SourceKind = 'url' | 'file'

export function PlaylistDialog({
  existingId,
  onClose
}: {
  existingId: number | null // existing playlist → re-import
  onClose: () => void
}): React.JSX.Element {
  const [mode, setMode] = React.useState<SourceKind>('url')
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [filePath, setFilePath] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<ImportPreview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [progress, setProgress] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (existingId !== null) {
      void window.api.playlist.list().then((lists) => {
        const p = lists.find((x) => x.id === existingId)
        if (p) {
          setName(p.name)
          if (p.sourceType === 'url' && p.sourceUrl) {
            setMode('url')
            setUrl(p.sourceUrl)
          } else if (p.sourcePath) {
            setMode('file')
            setFilePath(p.sourcePath)
          }
        }
      })
    }
  }, [existingId])

  React.useEffect(() => {
    const off = window.api.onImportProgress((p) => {
      const progressEvent = p as { phase: string; done: number; total: number }
      setProgress(`${progressEvent.phase}… ${progressEvent.total ? progressEvent.done : ''}`)
    })
    return off
  }, [])

  const doPreview = async (): Promise<void> => {
    setBusy(true)
    setPreview(null)
    try {
      const result = await window.api.import.preview({
        sourceType: mode,
        source: mode === 'url' ? url : (filePath ?? '')
      })
      setPreview(result)
      if (name === '' && result.sample[0]?.groupName === undefined) {
        setName(mode === 'url' ? new URL(url).hostname : 'Imported playlist')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await window.api.import.run({
        name: name || (mode === 'url' ? new URL(url).hostname : 'Imported playlist'),
        sourceType: mode,
        source: mode === 'url' ? url : (filePath ?? ''),
        playlistId: existingId ?? undefined,
        pruneMissing: false
      })
      setResult(result)
      toast.success(`Imported ${result.inserted} new, updated ${result.updated}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const pickFile = async (): Promise<void> => {
    const path = await window.api.app.pickFile([{ name: 'M3U playlists', extensions: ['m3u', 'm3u8', 'txt'] }])
    setFilePath(path)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingId === null ? 'Import playlist' : `Playlist: ${name}`}</DialogTitle>
          <DialogDescription>Import channels from an M3U playlist (URL or file).</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-2 text-sm">
            <div>Parsed {result.parsed} channels in {(result.durationMs / 1000).toFixed(1)}s</div>
            <div className="text-muted-foreground">
              Inserted: {result.inserted} · Updated: {result.updated} · Skipped: {result.skipped}
              {result.pruned > 0 && ` · Pruned: ${result.pruned}`}
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => void doImport(e)}>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'url' ? 'default' : 'outline'}
                onClick={() => setMode('url')}
              >
                <Globe className="h-4 w-4" /> URL
              </Button>
              <Button
                type="button"
                variant={mode === 'file' ? 'default' : 'outline'}
                onClick={() => setMode('file')}
              >
                <FileText className="h-4 w-4" /> Local file
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="playlist-name">Name</Label>
              <Input
                id="playlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My provider"
                required={existingId === null}
              />
            </div>

            {mode === 'url' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="playlist-url">Playlist URL</Label>
                <Input
                  id="playlist-url"
                  type="url"
                  required
                  placeholder="http://example.com/playlist.m3u"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Playlist file</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => void pickFile()}>
                    Choose file…
                  </Button>
                  <span className="flex items-center text-xs text-muted-foreground">{filePath ?? 'No file chosen'}</span>
                </div>
              </div>
            )}

            {preview && (
              <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
                <div>
                  {preview.count} channels
                  {preview.duplicateCount > 0 && ` (${preview.duplicateCount} duplicate URLs)`}
                  {preview.epgUrl && ` · EPG: ${preview.epgUrl}`}
                </div>
                {preview.sample.map((s) => (
                  <div key={s.url} className="truncate">
                    • {s.name} — {s.groupName ?? 'no group'}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={busy || (mode === 'url' ? !url : !filePath)}
                onClick={() => void doPreview()}
              >
                Preview
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {progress ?? (existingId === null ? 'Import' : 'Re-import')}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}