import http from 'node:http'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { rewriteManifest } from './manifestRewrite'
import { requestFollowingRedirects } from '../http'

const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface SessionEntry {
  dir: string
  onActivity: () => void
}

export interface ProxyHeaders {
  userAgent?: string | null
  referrer?: string | null
}

const MIME: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.vtt': 'text/vtt'
}

/**
 * Loopback HTTP server every <video> request flows through.
 *  /hls/:sessionId/...  — segments from a transcode session's temp dir
 *  /proxy?url=...       — CORS/UA/Referer-solving passthrough to the upstream
 *  /health              — status snapshot
 */
export class LocalStreamServer {
  private server: http.Server
  private sessions = new Map<string, SessionEntry>()
  private _port = 0

  get port(): number {
    return this._port
  }

  constructor() {
    this.server = http.createServer((req, res) => this.route(req, res))
    this.server.listen(0, '127.0.0.1', () => {
      const addr = this.server.address()
      this._port = typeof addr === 'object' && addr ? addr.port : 0
    })
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  registerSession(sessionId: string, dir: string, onActivity: () => void): void {
    this.sessions.set(sessionId, { dir, onActivity })
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()))
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Access-Control-Allow-Origin', '*')

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    try {
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (url.pathname.startsWith('/hls/')) {
        void this.serveSessionFile(url.pathname, res)
        return
      }

      if (url.pathname === '/proxy') {
        void this.proxy(url.searchParams.get('url'), req, res)
        return
      }

      res.writeHead(403)
      res.end()
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  }

  /** Serve transcode output from the session temp dir; 404 after cleanup. */
  private async serveSessionFile(pathname: string, res: http.ServerResponse): Promise<void> {
    const [, , sessionId, ...rest] = pathname.split('/')
    const file = rest.join('/')
    const session = this.sessions.get(sessionId)
    if (!session || !file || file.includes('..')) {
      res.writeHead(404)
      res.end()
      return
    }
    session.onActivity()
    const full = path.join(session.dir, file)
    try {
      const stat = await fsPromises.stat(full)
      if (!stat.isFile()) throw new Error('not a file')
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full)] ?? 'application/octet-stream',
        'Content-Length': stat.size
      })
      pipeline(fs.createReadStream(full), res, () => {})
    } catch {
      res.writeHead(404)
      res.end()
    }
  }

  private isForbiddenTarget(target: URL): boolean {
    if (!['http:', 'https:'].includes(target.protocol)) return true
    const host = target.hostname.toLowerCase()
    return ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host)
  }

  /**
   * Passthrough proxy. Adds spoofed UA/Referer, solves CORS (adds ACAO:*),
   * and rewrites HLS manifests so every URI inside them also points at /proxy.
   */
  private async proxy(
    rawUrl: string | null,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (!rawUrl) {
      res.writeHead(400)
      res.end()
      return
    }
    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    if (this.isForbiddenTarget(target)) {
      res.writeHead(403)
      res.end()
      return
    }

    const headers: Record<string, string> = {
      'user-agent': DEFAULT_UA,
      accept: '*/*'
    }
    if (req.headers.range) headers.range = req.headers.range
    if (req.headers.authorization) headers.authorization = req.headers.authorization

    let response
    try {
      response = await requestFollowingRedirects(target.toString(), { headers, headersTimeout: 0, bodyTimeout: 0 })
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end(`Upstream request failed: ${String(err)}`)
      return
    }

    const contentType = response.headers['content-type']?.toString() ?? ''
    const responseHeaders: Record<string, string | string[]> = {
      'content-type': contentType || 'application/octet-stream'
    }
    if (response.headers['content-length']) responseHeaders['content-length'] = response.headers['content-length']
    if (response.headers['content-range']) responseHeaders['content-range'] = response.headers['content-range']
    if (response.headers['accept-ranges']) responseHeaders['accept-ranges'] = response.headers['accept-ranges']

    if (HLS_TYPE.test(contentType)) {
      // Manifest: rewrite URIs to point back through /proxy, then send whole body.
      let body = ''
      for await (const chunk of response.body) body += String(chunk)
      const rewritten = rewriteManifest(body, target)
      res.writeHead(response.statusCode >= 400 ? response.statusCode : 200, {
        ...responseHeaders,
        'content-length': Buffer.byteLength(rewritten)
      })
      res.end(rewritten)
      return
    }

    res.writeHead(response.statusCode, responseHeaders)
    pipeline(response.body, res, () => {})
    req.on('close', () => response.body.destroy())
  }
}

const HLS_TYPE = /mpegurl/i