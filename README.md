# Pixera Dashboard

Showcaller-style desktop timer for **Pixera 25.x and newer**.

Current version: **1.0.6** — see [CHANGELOG.md](CHANGELOG.md).

### Short blurb (download site)

> **Pixera Dashboard** — live showcaller timers for Pixera 25+. Connect over the show network, show time-to-next-cue and cue elapsed, and embed a full timer or countdown-only confidence view in a browser. Demo mode works without Pixera. macOS (Apple Silicon) and Windows.

## Features

- Running layer and running video file
- Time to next cue (colour, size, last-seconds warning / flash, optional frames)
- Cue running time
- Optional cue names, timeline timecode, wait vs cue-countdown
- Browser output (`/timer` full board, `/confidence` countdown only) for embedding in Pixera
- Demo mode (no Pixera needed) and JSON/TCP live connect
- Dark / light, night chrome, connection profiles

## Download

Get the latest build from the [GitHub Releases](https://github.com/desertdognl/pixera-dashboard/releases) page:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Pixera-Dashboard-1.0.6-mac-arm64.zip` |
| Windows (64-bit) | `Pixera-Dashboard-1.0.6-win-x64.exe` (installer) or `.zip` (portable) |

Version numbers in the filenames match the release tag.

App packages contain **only the built app** (`out/` + `package.json`) — no backlog, agent notes, or internal docs.

---

## macOS — first open (unsigned build)

The Mac app is **not** notarized (no Apple Developer signing yet). Gatekeeper will block it until you clear quarantine.

### 1. Download and unzip

Download the `.zip` from Releases, then double-click to unzip. You get `Pixera Dashboard.app`.

### 2. Clear Gatekeeper quarantine (Terminal)

Open **Terminal** and run (adjust the path if you moved the app):

```bash
# If the app is in Downloads:
xattr -cr ~/Downloads/Pixera\ Dashboard.app

# Or if you already put it in Applications:
xattr -cr "/Applications/Pixera Dashboard.app"
```

What this does: removes the “downloaded from the internet” quarantine flag so macOS allows the app to launch.

Check that the flag is gone:

```bash
xattr -l "/Applications/Pixera Dashboard.app"
```

You should see little or no `com.apple.quarantine` output.

### 3. First launch

1. Move `Pixera Dashboard.app` to **Applications** (optional but recommended).
2. **Right-click** (or Control-click) the app → **Open**.
3. Confirm **Open** in the dialog.

After that, normal double-click works.

### If macOS still says the app is damaged / can’t be opened

```bash
xattr -cr "/Applications/Pixera Dashboard.app"
sudo spctl --master-disable
```

Then try **Open** again. Re-enable Gatekeeper when done:

```bash
sudo spctl --master-enable
```

Prefer only `xattr -cr` when possible; `spctl` is a broader system switch.

### Local Network (macOS Sequoia / Tahoe)

Dashboard and Control are **separate apps**. macOS can allow one and block the other.

If Connect fails with **host unreachable** while Pixera Control works on the same IP:

1. **System Settings → Privacy & Security → Local Network**
2. Turn **on** **Pixera Dashboard**
3. Quit and reopen the app, then Connect again

### Apple Silicon only

The published Mac build is **arm64** (M1 / M2 / M3 / M4). Intel Macs are not covered in this release.

---

## Windows — first open (unsigned build)

The Windows build is **not** code-signed. SmartScreen may warn.

### Installer (`.exe`)

1. Run `Pixera-Dashboard-*-win-x64.exe`.
2. If **Windows protected your PC** appears → **More info** → **Run anyway**.
3. Finish the installer and start **Pixera Dashboard** from the Start menu.

### Portable (`.zip`)

1. Unzip the archive.
2. Run `Pixera Dashboard.exe`.
3. Same SmartScreen steps if prompted (*More info* → *Run anyway*).

---

## Connect to Pixera

This dashboard is a TCP **client**. Pixera is the TCP **server**. You only need **API Access Input**. Leave **Output** unused.

### In Pixera

**Settings → API → Access Input**

| Field | Typical setup |
| --- | --- |
| Protocol | `JSON/TCP` on port **1400** |
| Adapter | Pixera’s own NIC / IP |
| Destination IP | Empty, `0.0.0.0`, or the Adapter IP |
| HTTP/TCP | Port **0** (off) |

Restart Pixera after changing this tab.

### In this app

1. Open **Settings**.
2. Mode: **Pixera JSON/TCP (auto)** (or force `pxr1` / `dl` if needed).
3. IP = Pixera **Adapter** IP (use `127.0.0.1` only if the dashboard runs on the Pixera computer).
4. Port **1400**.
5. Save and connect.

**Demo** mode never opens a network socket — use it to check layout without Pixera.

### Browser output / embed

With the app running, Settings → **Browser output** lists URLs on one port, for example:

- `http://127.0.0.1:8010/timer` — full showcaller board
- `http://127.0.0.1:8010/confidence` — countdown only

Use either in a browser or a Pixera HTML / web resource. Keep this app running.

---

## Develop (optional)

```bash
npm install
npm run dev
npm test
```

Local Mac app while developing:

```bash
npm run pack:mac
```

Release builds (CI also builds these on a version tag):

```bash
npm run dist:mac
npm run dist:win
```
