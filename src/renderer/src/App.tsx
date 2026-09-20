import * as React from 'react'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { ChannelList } from './components/ChannelList'
import { PlayerPane } from './components/PlayerPane'
import { ChannelDialog } from './components/ChannelDialog'
import { PlaylistDialog } from './components/PlaylistDialog'
import { Toasts } from './components/Toasts'
import { useAppStore } from './store/appStore'

export default function App(): React.JSX.Element {
  const loadPlaylists = useAppStore((s) => s.loadPlaylists)
  const loadGroups = useAppStore((s) => s.loadGroups)
  const loadChannels = useAppStore((s) => s.loadChannels)
  const handleStreamEvent = useAppStore((s) => s.handleStreamEvent)

  const [channelDialog, setChannelDialog] = React.useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [playlistDialog, setPlaylistDialog] = React.useState<{ open: boolean; id: number | null }>({ open: false, id: null })

  React.useEffect(() => {
    void (async () => {
      await loadPlaylists()
      await loadGroups()
      await loadChannels()
    })()
  }, [loadPlaylists, loadGroups, loadChannels])

  React.useEffect(() => {
    const off = window.api.onStreamEvent(handleStreamEvent)
    return off
  }, [handleStreamEvent])

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onNewChannel={() => setChannelDialog({ open: true, id: null })}
        onNewPlaylist={() => setPlaylistDialog({ open: true, id: null })}
        onToggleFavorites={() =>
          useAppStore.getState().setQuery({ favoritesOnly: !useAppStore.getState().query.favoritesOnly })
        }
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar onEditPlaylist={(id) => setPlaylistDialog({ open: true, id })} />
        <ChannelList onEditChannel={(id) => setChannelDialog({ open: true, id })} />
        <PlayerPane />
      </div>

      {channelDialog.open && (
        <ChannelDialog channelId={channelDialog.id} onClose={() => setChannelDialog({ open: false, id: null })} />
      )}
      {playlistDialog.open && (
        <PlaylistDialog existingId={playlistDialog.id} onClose={() => setPlaylistDialog({ open: false, id: null })} />
      )}
      <Toasts />
    </div>
  )
}