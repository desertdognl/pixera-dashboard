# Changelog

All notable changes to Pixera Dashboard are documented here.

The project follows [Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**.

The app version lives in `package.json` and `src/shared/version.ts`. Keep those two values identical when you release. The version is shown in Settings as **vX.Y.Z**.


## 1.0.6 — 2026-09-25

### Fixed
- Mac release build on GitHub Actions uses the committed `.icns` (no Pillow on the runner)

## 1.0.5 — 2026-09-25

### Fixed
- Dock icon stays the rounded macOS `.icns` while the app is open (no longer swaps in the square `icon.png`)

## 1.0.4 — 2026-09-25

### Fixed
- Confidence `/confidence` shows the countdown again (own full-viewport layout instead of the scaled stage board)

## 1.0.3 — 2026-09-25

### Added
- Browser confidence output at `/confidence` on the same port as `/timer` — countdown only (warn colour and flash still apply)

## 1.0.2 — 2026-09-24

### Fixed
- macOS Local Network permission: app declares why it needs the show LAN (same IP can work in Pixera Control while Dashboard was blocked)
- EHOSTUNREACH message points to System Settings → Privacy & Security → Local Network
- Save and connect also updates the active profile so host/mode stay in sync

## 1.0.1 — 2026-09-24

### Fixed
- Connect errors say when the Pixera IP is unreachable on the network, instead of always blaming JSON/TCP framing

## 0.11.7 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Changed
- Cue and Next under the timers follow **What to show**: Current cue name and Next cue name. Both stay off by default

## 0.11.6 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Settings opens above the topbar instead of underneath it

### Changed
- `npm run pack:mac` updates `release/mac-arm64/Pixera Dashboard.app` in place, so the local test app stays on the current version without a full DMG

## 0.11.5 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Fullscreen and browser output keep the dashboard inside the window: the timer board is sized to the space under the topbar, so the play/pause control stays on screen and the topbar no longer covers the content

## 0.11.4 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Play/pause control is no longer clipped at the bottom. The Desert Dog mark floats in the corner with no bar or background behind it

### Changed
- `npm run dist`, `dist:mac` and `dist:win` empty the `release/` folder first so old `.app` / `.dmg` files do not stack

## 0.11.3 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Fullscreen and browser output keep the whole dashboard in view: the board is scaled to the space under the topbar, so the play/pause control is no longer clipped and the topbar no longer covers the timers

## 0.11.2 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Mac app icon follows macOS 26 geometry: 1024×1024 canvas, 824×824 squircle, 100px transparent inset. The previous full-bleed square looked too large and square in Finder and the Dock

## 0.11.1 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Fixed
- Logos load in the packaged Mac app (they were missing from the build, so Finder showed broken-image icons)
- Dashboard scales with the window, so timers and labels stay in view

### Changed
- Settings group **Halls** is now **Profiles**
- Profiles sit just above Pixera setup help, at the bottom of Settings, above the logo and action buttons

## 0.11.0 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Added
- Real Mac app via `npm run dist:mac` (Apple Silicon `.app` + `.dmg`, Electron bundled)
- App icon is a 1024×1024 iOS 26 / macOS 26 squircle `.icns`, from the existing Desert Dog + timer mark

### Removed
- The 192 KB `/Applications` launcher that only started `npm run dev`

## 0.10.1 — 2026-09-21

Demo-only work. Not live-tested against Pixera.


## 0.10.0 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Changed
- Settings is grouped into collapsible sections so the panel stays short: Connect and What to show stay open; halls, Pixera help, sources, timers, look, and browser output start collapsed
- Open/closed state is remembered for the session
- Save / Connect / Disconnect stay pinned at the bottom of Settings

## 0.9.0 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Added
- UDP heartbeat listen (Pixera Settings → API → Heartbeat). Lists JSON/TCP endpoints; click to fill IP, port, and mode. Does not scan the LAN
- Optional display fields: timeline timecode, wait vs cue-countdown
- Current / next cue names when enabled: one Compound try, otherwise previous/next cue on a jump only — never a clip or cue-handle loop
- Connection profiles (hall name, IP, port, mode) for touring kits
- Operator night mode dims the top bar and corner logo; the embed stays full brightness
- Dedicated browser path `/timer` with no Settings chrome, including first paint

## 0.8.0 — 2026-09-21

Demo-only work. Not live-tested against Pixera.

### Added
- Countdown can flash/pulse in the last N seconds (on in Settings by default). Local CSS only — no extra Pixera calls
- Poll interval in Settings: 1.2 s / 1.5 s (default) / 2 s / 3 s / 4 s. Never faster than 1.2 s

## 0.7.0 — 2026-09-21

### Added
- Dark / light appearance in Settings, including the browser output
- Desert Dog logo in the bottom-left of the window and at the bottom of Settings (opens https://desertdog.nl)
- App icon based on the Desert Dog mark with a timer overlay

### Changed
- Top bar only shows connection status, Connect (when needed), Fullscreen, and Settings
- Disconnect lives in Settings

## 0.6.1 — 2026-09-21

### Fixed
- Choosing Demo and connecting no longer tries `127.0.0.1:1400`. An IP in the form is ignored until the mode is a JSON/TCP option.

### Added
- Settings explain each connection mode (Demo, JSON/TCP auto, pxr1, and JSON/TCP dl)

### Changed
- JSON/TCP (auto) tries the `pxr1` header first, then the older `0xPX` suffix if Pixera does not answer
- Forced pxr1 / dl modes now use that framing instead of always defaulting to auto

## 0.6.0 — 2026-09-21

Last version tested live against a real Pixera. See **Development checkpoint** above.

### Changed
- Live Pixera polling is lighter: about three Compound reads per tick, default 1.5s interval, no clip-span scans
- Video file is cached and refreshed at most every 8 seconds, and skipped on a cue jump
- Timeline follow checks the current timeline first and scans at most two others per tick
- The UI interpolates timers locally (100ms only if frames are shown, otherwise 250ms) and pauses when the window is hidden
- Identical pause/stop snapshots are not pushed to the window or browser output

### Added
- Separate time format for the last-seconds countdown window (default HH:MM:SS:FF so frames can be shown)
- Unit tests for time formatting and poll helpers (`npm test`)

## 0.5.0 — 2026-09-21

### Added
- Font size for running layer and running video (video is smaller by default)
- Browser output on port 8010 so the timers can be opened in a browser and embedded in Pixera
- Settings show the exact IP addresses and port to connect to

## 0.4.1 — 2026-09-21

### Changed
- Transport is shown as a Pixera-style play / pause / stop icon
- Removed the extra Layer label from the dashboard; the running timeline is already the headline

## 0.4.0 — 2026-09-21

### Added
- Settings for countdown and cue-running color and font size
- Countdown can switch to a warning color in the last N seconds (default: red at 10 seconds)

## 0.3.0 — 2026-09-21

### Changed
- Headline is labeled **Running layer** (the playing timeline, for example MOVIE 2)
- Cue running is centered, same as time to next cue

### Added
- Separate **Running video** field for the clip file on the selected layer
- Settings can pin which layer to read the video file from, or auto-pick the first layer with a clip

## 0.2.1 — 2026-09-21

### Changed
- Dashboard follows the timeline that is playing in Pixera (for example MOVIE 2 → MOVIE 1)

## 0.2.0 — 2026-09-21

### Changed
- Live connection uses JSON/TCP `pxr1` (same as this Pixera on 192.168.1.161:1400)
- Connecting with an IP set leaves Demo mode automatically
- Live polling is Compound-only, once per second, with no clip or cue handle queries

### Added
- Pixera API Access Input/Output setup help
- Auto framing for JSON/TCP
- Visible app version in the top bar and Settings

### Fixed
- Dashboard stayed in Demo after entering a Pixera IP
- JSON/TCP (dl) / `0xPX` was used against a `pxr1` port, so connect failed

## 0.1.0 — 2026-09-21

### Added
- First Mac test build of a cross-platform Electron showcaller dashboard
- Demo mode so the layout can be checked without Pixera
- Live fields: running video file, time to next cue, cue running time
- Optional fields: current cue name and next cue name
- Settings for Pixera version, host, port, timeline, layer, time format, and always-on-top
- Mock Pixera TCP server for local protocol tests
- Project backlog and this changelog
