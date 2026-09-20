import { app } from 'electron'
import type { AppCapabilities } from '@shared/types'
import { resolveFfmpeg } from './stream/ffmpegLocator'

export async function getAppCapabilities(): Promise<AppCapabilities> {
  const ffmpeg = await resolveFfmpeg()
  return {
    platform: process.platform,
    appVersion: app.getVersion(),
    ffmpeg
  }
}