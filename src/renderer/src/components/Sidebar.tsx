import * as React from 'react'
import { ListVideo, Star, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/appStore'
import { toast } from './Toasts'
import { Badge } from './ui/badge'

interface SidebarProps {
  onEditPlaylist: (playlistId: number) => void
}

export function Sidebar({ onEditPlaylist }: SidebarProps): React.JSX.Element {
  const playlists = useAppStore((s) => s.playlists)
  const groups = useAppStore((s) => s.groups)
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const loadPlaylists = useAppStore((s) => s.loadPlaylists)
  const loadChannels = useAppStore((s) => s.loadChannels)

  const selectView = (patch: { playlistId?: number | null; group?: string; favoritesOnly?: boolean }): void => {
    setQuery({ ...patch, group: patch.group ?? undefined, favoritesOnly: patch.favoritesOnly ?? false })
  }

  const removePlaylist = async (id: number, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm('Delete this playlist and all its channels?')) return
    await window.api.playlist.remove(id)
    toast.success('Playlist deleted')
    await loadPlaylists()
    await loadChannels()
  }

  const isSelected = (key: string): boolean =>
    (key === 'favorites' && query.favoritesOnly) ||
    (key === 'all' && !query.favoritesOnly && !query.playlistId && !query.group)

  return (
    <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted',
          isSelected('favorites') && 'bg-muted font-medium'
        )}
        onClick={() => selectView({ favoritesOnly: true })}
      >
        <Star className="h-4 w-4 text-primary" /> Favorites
      </button>
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted',
          isSelected('all') && 'bg-muted font-medium'
        )}
        onClick={() => selectView({ playlistId: null, group: undefined, favoritesOnly: false })}
      >
        <ListVideo className="h-4 w-4" /> All channels
      </button>

      <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-muted-foreground">Playlists</div>
      {playlists.map((p) => {
        const active = query.playlistId === p.id && !query.group
        return (
          <div
            key={p.id}
            className={cn(
              'group flex items-center gap-1 px-1 hover:bg-muted',
              active && 'bg-muted font-medium'
            )}
          >
            <button
              className="flex-1 truncate px-2 py-2 text-left text-sm"
              onClick={() => {
                selectView({ playlistId: p.id })
                onEditPlaylist(p.id)
              }}
              title={`${p.name} — ${p.channelCount} channels (click to edit)`}
            >
              {p.name}
              <span className="ml-2 text-xs text-muted-foreground">{p.channelCount}</span>
            </button>
            <button
              className="hidden p-1 text-muted-foreground hover:text-destructive group-hover:block"
              onClick={(e) => void removePlaylist(p.id, e)}
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}

      <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-muted-foreground">Groups</div>
      {groups.length === 0 && <div className="px-3 py-1 text-xs text-muted-foreground">No groups</div>}
      {groups.map((g) => (
        <button
          key={g.name}
          className={cn(
            'flex items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted',
            query.group === g.name && 'bg-muted font-medium'
          )}
          onClick={() => selectView({ group: g.name, playlistId: undefined })}
        >
          <span className="truncate">{g.name}</span>
          <Badge>{g.count}</Badge>
        </button>
      ))}
      <div className="flex-1" />
    </div>
  )
}