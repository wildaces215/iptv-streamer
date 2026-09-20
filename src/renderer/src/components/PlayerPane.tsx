import * as React from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { HlsPlayer } from '../player/HlsPlayer'
import { useAppStore } from '../store/appStore'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

export function PlayerPane(): React.JSX.Element {
  const player = useAppStore((s) => s.player)
  const playChannel = useAppStore((s) => s.playChannel)
  const stopPlayback = useAppStore((s) => s.stopPlayback)
  const [logOpen, setLogOpen] = React.useState(false)

  if (player.channelId === null || player.status === 'idle') {
    return (
      <div className="flex w-[420px] shrink-0 items-center justify-center border-l border-border bg-black text-sm text-muted-foreground">
        Select a channel to start watching
      </div>
    )
  }

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l border-border bg-black">
      <div className="flex items-center gap-2 px-3 py-2">
        <Badge>
          {player.mode === 'direct-hls' ? 'HLS direct' : player.mode === 'transcode-remux' ? 'ffmpeg remux' : 'ffmpeg transcode'}
        </Badge>
        {player.status === 'loading' && <Badge>Loading…</Badge>}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          title="Restart with forced transcode"
          onClick={() => player.channelId !== null && void playChannel(player.channelId, { forceTranscode: true })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void stopPlayback()}>
          Stop
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {player.status === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <div className="text-destructive">{player.error ?? 'Playback failed'}</div>
            <Button size="sm" variant="outline" onClick={() => player.channelId !== null && void playChannel(player.channelId)}>
              Retry
            </Button>
          </div>
        ) : player.playbackUrl ? (
          <HlsPlayer />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connecting…</div>
        )}
      </div>

      <div className="border-t border-border">
        <button
          className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground"
          onClick={() => setLogOpen((open) => !open)}
        >
          {logOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          ffmpeg log
        </button>
        {logOpen && (
          <pre className="max-h-40 overflow-auto bg-muted/40 p-2 text-[10px] leading-tight text-muted-foreground">
            {player.stderrTail.length > 0 ? player.stderrTail.join('\n') : '(no ffmpeg output)'}
          </pre>
        )}
      </div>
    </div>
  )
}