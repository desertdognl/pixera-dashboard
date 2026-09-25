import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const root = resolve('.')
const appPath = resolve('release/mac-arm64/Pixera Dashboard.app')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

function buildDirApp() {
  const result = spawnSync(
    'npx',
    ['electron-builder', '--mac', 'dir', '-c.mac.target=dir'],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
    }
  )
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(appPath)) {
  console.log('No local Mac app yet — building release/mac-arm64/Pixera Dashboard.app')
  buildDirApp()
  console.log(`Local Mac app ready (v${version})`)
  process.exit(0)
}

const stage = resolve('.tmp-mac-asar')
rmSync(stage, { recursive: true, force: true })
mkdirSync(join(stage, 'out'), { recursive: true })
cpSync(resolve('out'), join(stage, 'out'), { recursive: true })
writeFileSync(join(stage, 'package.json'), readFileSync(join(root, 'package.json')))

const asarPath = join(appPath, 'Contents/Resources/app.asar')
const iconPath = join(appPath, 'Contents/Resources/icon.icns')
const plistPath = join(appPath, 'Contents/Info.plist')
const sourceIcon = resolve('resources/icon.icns')

await asar.createPackage(stage, asarPath)
rmSync(stage, { recursive: true, force: true })

if (existsSync(sourceIcon)) cpSync(sourceIcon, iconPath)
execFileSync('plutil', ['-replace', 'CFBundleShortVersionString', '-string', version, plistPath])
execFileSync('plutil', ['-replace', 'CFBundleVersion', '-string', version, plistPath])

const localNetworkKey = 'NSLocalNetworkUsageDescription'
const localNetworkText =
  'Pixera Dashboard connects to Pixera over the show network (JSON/TCP) to read cue and timer data.'
try {
  execFileSync('plutil', ['-replace', localNetworkKey, '-string', localNetworkText, plistPath])
} catch {
  execFileSync('plutil', ['-insert', localNetworkKey, '-string', localNetworkText, plistPath])
}

console.log(`Updated ${appPath} to v${version}`)
console.log('Quit and reopen the app if it is already running.')
console.log(
  'If Connect still fails with host unreachable while Pixera Control works: System Settings → Privacy & Security → Local Network → enable Pixera Dashboard.'
)
