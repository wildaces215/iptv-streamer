import * as React from 'react'
import Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import { ProxyLoader } from './ProxyLoader'
import { useAppStore } from '../store/appStore'

/**
 * <video> + hls.js lifecycle. The <video> element itself never remounts on
 * channel-list changes; only src changes propagate here via player.playbackUrl.
 */
export function HlsPlayer(): React.JSX.Element {
  const playbackUrl = useAppStore((s) => s.player.playbackUrl)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const hlsRef = React.useRef<Hls | null>(null)
  const playChannel = useAppStore((s) => s.playChannel)
  const channelId = useAppStore((s) => s.player.channelId)
  const forceTranscodeRetried = React.useRef(false)

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !playbackUrl) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        maxBufferLength: 12,
        maxMaxBufferLength: 30,
        backBufferLength: 30,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 6,
        startFragPrefetch: true,
        pLoader: ProxyLoader as unknown as HlsConfig['pLoader'],
        fLoader: ProxyLoader as unknown as HlsConfig['fLoader']
      })
      hlsRef.current = hls
      hls.loadSource(playbackUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Bounded retry, then fall back to a forced transcode session.
            if (forceTranscodeRetried.current || channelId === null) {
              hls.destroy()
              hlsRef.current = null
            } else {
              forceTranscodeRetried.current = true
              void playChannel(channelId, { forceTranscode: true })
            }
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError()
            break
          default:
            hls.destroy()
            hlsRef.current = null
        }
      })
    } else if (nativeHls) {
      video.src = playbackUrl
    }
    void video.play().catch(() => {})

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [playbackUrl, channelId, playChannel])

  return (
    <video
      ref={videoRef}
      className="h-full w-full bg-black"
      controls
      autoPlay
      playsInline
    />
  )
}