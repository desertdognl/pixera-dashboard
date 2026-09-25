import http from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { networkInterfaces } from 'node:os'
import type { AppSettings, LiveState, OutputInfo } from '../shared/types'
import { EMPTY_OUTPUT_INFO } from '../shared/types'
import { APP_VERSION } from '../shared/version'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

const FLAG_SCRIPT = "window.__PIXERA_OUTPUT__=true;document.documentElement.dataset.output='1';"
const CONFIDENCE_FLAG_SCRIPT =
  "window.__PIXERA_OUTPUT__=true;document.documentElement.dataset.output='1';document.documentElement.dataset.confidence='1';"
const INJECT = '<script src="/output-flag.js"></script>'
const INJECT_CONFIDENCE = '<script src="/output-flag.js?mode=confidence"></script>'

export function lanAddresses(): string[] {
  const found = new Set<string>(['127.0.0.1'])
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list || []) {
      const v4 = item.family === 'IPv4' || (item.family as unknown) === 4
      if (v4 && item.address) found.add(item.address)
    }
  }
  return [...found]
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(json)
}

function injectHtml(html: string, confidence = false): string {
  const tag = confidence ? INJECT_CONFIDENCE : INJECT
  if (html.includes('/output-flag.js')) return html
  if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`)
  return `${tag}${html}`
}

export class OutputServer {
  private server: http.Server | null = null
  private clients = new Set<http.ServerResponse>()
  private enabled = false
  private port = 8010
  private error: string | null = null
  private staticRoot = ''
  private devProxyUrl = ''
  private getState: () => LiveState
  private getSettings: () => AppSettings

  constructor(options: {
    getState: () => LiveState
    getSettings: () => AppSettings
  }) {
    this.getState = options.getState
    this.getSettings = options.getSettings
  }

  getInfo(): OutputInfo {
    if (!this.enabled) {
      return { ...EMPTY_OUTPUT_INFO, port: this.port, enabled: false, error: this.error }
    }
    if (this.error || !this.server) {
      return {
        enabled: true,
        port: this.port,
        urls: [],
        confidenceUrls: [],
        error: this.error
      }
    }
    const hosts = [...lanAddresses().filter((ip) => ip !== '127.0.0.1'), '127.0.0.1']
    return {
      enabled: true,
      port: this.port,
      urls: hosts.map((ip) => `http://${ip}:${this.port}/timer`),
      confidenceUrls: hosts.map((ip) => `http://${ip}:${this.port}/confidence`),
      error: null
    }
  }

  async start(options: {
    enabled: boolean
    port: number
    staticRoot: string
    devProxyUrl?: string
  }): Promise<OutputInfo> {
    await this.stop()
    this.enabled = options.enabled
    this.port = options.port
    this.staticRoot = options.staticRoot
    this.devProxyUrl = options.devProxyUrl || ''
    this.error = null
    if (!this.enabled) return this.getInfo()

    await new Promise<void>((resolve) => {
      const server = http.createServer((req, res) => void this.handle(req, res))
      server.on('error', (error: NodeJS.ErrnoException) => {
        this.error =
          error.code === 'EADDRINUSE'
            ? `Port ${this.port} is already in use. Pick another browser output port.`
            : error.message
        this.server = null
        resolve()
      })
      server.listen(this.port, '0.0.0.0', () => {
        this.server = server
        this.error = null
        resolve()
      })
    })
    return this.getInfo()
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.end()
    this.clients.clear()
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  clientCount(): number {
    return this.clients.size
  }

  broadcast(event: string, data: unknown): void {
    if (!this.clients.size) return
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of this.clients) client.write(payload)
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const confidencePage =
      url.pathname === '/confidence' || url.pathname === '/confidence/'
    if (url.pathname === '/timer' || url.pathname === '/timer/' || confidencePage) {
      url.pathname = '/'
    }

    if (url.pathname === '/api/state') {
      sendJson(res, 200, this.getState())
      return
    }
    if (url.pathname === '/api/settings') {
      sendJson(res, 200, this.getSettings())
      return
    }
    if (url.pathname === '/api/version') {
      sendJson(res, 200, { version: APP_VERSION })
      return
    }
    if (url.pathname === '/api/output') {
      sendJson(res, 200, this.getInfo())
      return
    }
    if (url.pathname === '/api/events') {
      this.attachSse(res)
      return
    }
    if (url.pathname === '/output-flag.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(url.searchParams.get('mode') === 'confidence' ? CONFIDENCE_FLAG_SCRIPT : FLAG_SCRIPT)
      return
    }

    if (this.devProxyUrl) {
      await this.proxy(url, req, res, confidencePage)
      return
    }

    this.serveStatic(url.pathname, res, confidencePage)
  }

  private attachSse(res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    })
    res.write(`event: settings\ndata: ${JSON.stringify(this.getSettings())}\n\n`)
    res.write(`event: state\ndata: ${JSON.stringify(this.getState())}\n\n`)
    this.clients.add(res)
    res.on('close', () => this.clients.delete(res))
  }

  private serveStatic(pathname: string, res: http.ServerResponse, confidence = false): void {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const resolved = normalize(join(this.staticRoot, relative))
    if (!resolved.startsWith(normalize(this.staticRoot + sep)) && resolved !== this.staticRoot) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    let file = resolved
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(this.staticRoot, 'index.html')
    }
    if (!existsSync(file)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const type = MIME[extname(file)] || 'application/octet-stream'
    if (file.endsWith('.html')) {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(injectHtml(readFileSync(file, 'utf8'), confidence))
      return
    }
    res.writeHead(200, { 'Content-Type': type })
    createReadStream(file).pipe(res)
  }

  private async proxy(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    confidence = false
  ): Promise<void> {
    try {
      const target = new URL(url.pathname + url.search, this.devProxyUrl)
      const incoming = await fetch(target, {
        headers: { accept: String(req.headers.accept || '*/*') }
      })
      const buffer = Buffer.from(await incoming.arrayBuffer())
      const contentType = incoming.headers.get('content-type') || 'application/octet-stream'
      let body: Buffer | string = buffer
      if (contentType.includes('text/html')) body = injectHtml(buffer.toString('utf8'), confidence)
      res.writeHead(incoming.status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      })
      res.end(body)
    } catch {
      res.writeHead(502)
      res.end('Browser output could not reach the dashboard UI')
    }
  }
}
