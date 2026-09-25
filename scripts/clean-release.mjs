import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve('release')
rmSync(dir, { recursive: true, force: true })
console.log(`Cleared ${dir}`)
