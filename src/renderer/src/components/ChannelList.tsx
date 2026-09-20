import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MoreVertical, Pencil, Play, Star, Trash2, Tv } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { toast } from './Toasts'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

const ROW_HEIGHT = 52

function Logo({ url, name }: { url: string | null; name: string }): React.JSX.Element {
  const [failed, setFailed] = React.useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 rounded bg-muted object-contain p-1"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function ChannelList({
  onEditChannel
}: {
  onEditChannel: (channelId: number) => void
}): React.JSX.Element {
  const channels = useAppStore((s) => s.channels)
  const total = useAppStore((s) => s.channelsTotal)
  const loadMore = useAppStore((s) => s.loadMoreChannels)
  const playChannel = useAppStore((s) => s.playChannel)
  const playerChannelId = useAppStore((s) => s.player.channelId)
  const loadChannels = useAppStore((s) => s.loadChannels)
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  // Load rows lazily as the virtualizer scrolls past what we have fetched.
  const rangeEnd = virtualizer.range?.endIndex ?? 0
  React.useEffect(() => {
    if (rangeEnd + 20 > channels.length) void loadMore()
  }, [rangeEnd, channels.length, loadMore])

  const favorite = async (channel: { id: number; isFavorite: boolean; name: string }): Promise<void> => {
    await window.api.channels.favorite(channel.id, !channel.isFavorite)
    await loadChannels()
  }

  const remove = async (channel: { id: number; name: string }): Promise<void> => {
    if (!window.confirm(`Delete channel "${channel.name}"?`)) return
    await window.api.channels.remove(channel.id)
    await loadChannels()
    toast.success('Channel deleted')
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const channel = channels[item.index]
          if (!channel) return null
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${item.start}px)`
              }}
              className={`group flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 hover:bg-muted/60 ${
                playerChannelId === channel.id ? 'bg-primary/10' : ''
              }`}
              onClick={() => void playChannel(channel.id)}
            >
              <Logo url={channel.logoUrl} name={channel.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-sm">
                  {channel.name}
                  {channel.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{channel.url}</div>
              </div>
              {channel.groupName && <Badge>{channel.groupName}</Badge>}

              <Button
                variant="ghost"
                size="icon"
                className="hidden group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation()
                  void playChannel(channel.id)
                }}
                aria-label={`Play ${channel.name}`}
              >
                <Play className="h-4 w-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" aria-label="Channel actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void favorite(channel)}>
                    <Star className="h-4 w-4" />
                    {channel.isFavorite ? 'Unfavorite' : 'Favorite'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditChannel(channel.id)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    onClick={() => void remove(channel)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>
      {total === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Tv className="h-10 w-10" />
          <div className="text-sm">No channels — import a playlist or add one manually</div>
        </div>
      )}
    </div>
  )
}