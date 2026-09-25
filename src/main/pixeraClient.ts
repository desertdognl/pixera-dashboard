import net from 'node:net'

export type Framing = 'delimiter' | 'pxr1'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const DELIMITER = '0xPX'
const HEADER = Buffer.from('pxr1')

export class PixeraClient {
  private socket: net.Socket | null = null
  private framing: Framing = 'pxr1'
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, Pending>()
  private connected = false
  private host = ''
  private port = 1400

  async connect(
    host: string,
    port: number,
    framing: Framing | 'auto' = 'auto',
    timeoutMs = 5000
  ): Promise<number> {
    const hostTrimmed = host.trim()
    this.host = hostTrimmed
    this.port = port
    await this.openSocket(hostTrimmed, port, timeoutMs)
    if (framing === 'auto') {
      this.framing = 'pxr1'
      const first = await this.readApiRevision()
      if (first != null) return first
      this.framing = 'delimiter'
      const second = await this.readApiRevision()
      if (second != null) return second
    } else {
      this.framing = framing === 'delimiter' ? 'delimiter' : 'pxr1'
      const revision = await this.readApiRevision()
      if (revision != null) return revision
    }
    throw new Error(`Connected to ${hostTrimmed}:${port} but Pixera did not return an API revision`)
  }

  private async readApiRevision(): Promise<number | null> {
    try {
      const revision = await this.call<number>('Pixera.Utility.getApiRevision', undefined, 2000)
      return typeof revision === 'number' ? revision : null
    } catch {
      return null
    }
  }

  private async openSocket(host: string, port: number, timeoutMs: number): Promise<void> {
    await this.close()
    this.buffer = Buffer.alloc(0)

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host, port })
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`Timed out connecting to ${host}:${port}`))
      }, timeoutMs)

      socket.once('connect', () => {
        clearTimeout(timer)
        this.socket = socket
        this.connected = true
        socket.setNoDelay(true)
        resolve()
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      socket.on('data', (chunk) => this.onData(chunk))
      socket.on('close', () => this.onClose())
    })
  }

  isConnected(): boolean {
    return this.connected && !!this.socket
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 4000): Promise<T> {
    if (!this.socket || !this.connected) throw new Error('Not connected to Pixera')
    const id = this.nextId++
    const payload: Record<string, unknown> = { jsonrpc: '2.0', id, method }
    if (params && Object.keys(params).length) payload.params = params
    const json = JSON.stringify(payload)

    const packet =
      this.framing === 'delimiter'
        ? Buffer.from(json + DELIMITER, 'utf8')
        : encodePxr1(json)

    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Pixera did not answer ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket!.write(packet)
    })

    return result as T
  }

  async close(): Promise<void> {
    const socket = this.socket
    this.socket = null
    this.connected = false
    this.rejectAll(new Error('Connection closed'))
    this.buffer = Buffer.alloc(0)
    if (!socket) return
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve())
      socket.destroy()
      setTimeout(resolve, 200)
    })
  }

  private onClose(): void {
    this.connected = false
    this.socket = null
    this.rejectAll(new Error('Pixera disconnected'))
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.framing === 'delimiter') this.drainDelimiter()
    else this.drainPxr1()
    if (this.buffer.length > 1_000_000) this.buffer = Buffer.alloc(0)
  }

  private drainDelimiter(): void {
    const needle = Buffer.from(DELIMITER, 'utf8')
    while (true) {
      const index = this.buffer.indexOf(needle)
      if (index < 0) return
      const json = this.buffer.subarray(0, index).toString('utf8').trim()
      this.buffer = this.buffer.subarray(index + needle.length)
      if (json) this.dispatch(json)
    }
  }

  private drainPxr1(): void {
    while (this.buffer.length >= 8) {
      if (this.buffer.subarray(0, 4).compare(HEADER) !== 0) {
        const next = this.buffer.indexOf(HEADER, 1)
        this.buffer = next >= 0 ? this.buffer.subarray(next) : Buffer.alloc(0)
        return
      }
      const size = this.buffer.readUInt32LE(4)
      if (this.buffer.length < 8 + size) return
      const json = this.buffer.subarray(8, 8 + size).toString('utf8')
      this.buffer = this.buffer.subarray(8 + size)
      if (json.trim()) this.dispatch(json)
    }
  }

  private dispatch(raw: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.error) {
      pending.reject(new Error(message.error.message || 'Pixera API error'))
      return
    }
    if (
      message.result &&
      typeof message.result === 'object' &&
      '_pixc' in (message.result as object)
    ) {
      pending.reject(new Error('Pixera returned an API exception'))
      return
    }
    pending.resolve(message.result)
  }
}

function encodePxr1(json: string): Buffer {
  const payload = Buffer.from(json, 'utf8')
  const header = Buffer.alloc(8)
  HEADER.copy(header, 0)
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload])
}

export function isHandle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
