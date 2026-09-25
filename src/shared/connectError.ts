/** Operator-facing text for TCP connect failures to Pixera. */
export function formatPixeraConnectError(
  error: unknown,
  host: string,
  port: number
): string {
  const raw = error instanceof Error ? error.message : String(error)
  const target = `${host.trim() || '—'}:${port}`
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code || '')
      : ''

  if (code === 'EHOSTUNREACH' || /EHOSTUNREACH/i.test(raw)) {
    return (
      `Cannot reach ${target} (host unreachable). ` +
      `On this Mac, check System Settings → Privacy & Security → Local Network and turn on Pixera Dashboard ` +
      `(Control can be allowed while Dashboard is blocked — they are separate apps). ` +
      `Also confirm you are on the show network and the Pixera IP is correct. ` +
      `This is not a JSON/TCP framing issue. Use Demo mode if Pixera is offline.`
    )
  }

  if (code === 'ENETUNREACH' || /ENETUNREACH/i.test(raw)) {
    return (
      `Network unreachable for ${target}. ` +
      `Connect this Mac to the same network as Pixera, or use Demo mode.`
    )
  }

  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(raw)) {
    return (
      `Connection refused at ${target}. ` +
      `The IP responds but nothing is listening on that port. ` +
      `In Pixera: Settings → API → Access Input — JSON/TCP on port ${port} (not 0). ` +
      `Companion can share the same port. Restart Pixera after changing the API tab.`
    )
  }

  if (code === 'ETIMEDOUT' || /Timed out connecting/i.test(raw) || /ETIMEDOUT/i.test(raw)) {
    return (
      `Timed out connecting to ${target}. ` +
      `Check the IP, that Pixera Access Input is on, and that a firewall is not blocking TCP ${port}.`
    )
  }

  if (code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(raw)) {
    return `Unknown host “${host.trim()}”. Enter the Pixera Adapter IP (numbers), not a name, unless DNS can resolve it.`
  }

  if (/did not return an API revision/i.test(raw)) {
    return (
      `${raw} ` +
      `Match Mode to Pixera Access Input: JSON/TCP → pxr1, JSON/TCP (dl) → 0xPX. ` +
      `Companion can share port ${port}. Port 0 is off.`
    )
  }

  return (
    `${raw} Tried ${target}. ` +
    `If the IP is wrong or offline, fix the network first. ` +
    `If the socket connects but readback fails, match Mode to Access Input (JSON/TCP → pxr1, dl → 0xPX).`
  )
}
