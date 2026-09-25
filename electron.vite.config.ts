import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const BRAND_FILES = ['icon.png', 'logo_full_white.png', 'AppIcon-1024.png']

function copyBrandAssets() {
  return {
    name: 'copy-brand-assets',
    closeBundle() {
      const dest = resolve('out/renderer')
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
      for (const file of BRAND_FILES) {
        const from = resolve('resources', file)
        if (existsSync(from)) copyFileSync(from, join(dest, file))
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@brand': resolve('resources')
      }
    },
    plugins: [react(), copyBrandAssets()],
    publicDir: resolve('resources')
  }
})
