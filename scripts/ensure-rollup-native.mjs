/**
 * Rollup 4 loads a platform-specific optional package (@rollup/rollup-*). npm sometimes
 * skips installing it when the lockfile was produced on another OS (npm/cli#4828).
 * Run after install so Linux/macOS/Windows CI and Docker get the correct binary.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function rollupNativeLoads() {
  const r = spawnSync(process.execPath, ['-e', "require('rollup/dist/native.js')"], {
    encoding: 'utf8',
  })
  return r.status === 0
}

if (rollupNativeLoads()) {
  process.exit(0)
}

let rollupVersion
try {
  rollupVersion = require('rollup/package.json').version
} catch {
  process.exit(0)
}

const { platform, arch } = process
const candidates = []

if (platform === 'linux') {
  const muslFirst = existsSync('/etc/alpine-release')
  if (arch === 'x64') {
    candidates.push(
      ...(muslFirst
        ? ['@rollup/rollup-linux-x64-musl', '@rollup/rollup-linux-x64-gnu']
        : ['@rollup/rollup-linux-x64-gnu', '@rollup/rollup-linux-x64-musl']),
    )
  } else if (arch === 'arm64') {
    candidates.push(
      ...(muslFirst
        ? ['@rollup/rollup-linux-arm64-musl', '@rollup/rollup-linux-arm64-gnu']
        : ['@rollup/rollup-linux-arm64-gnu', '@rollup/rollup-linux-arm64-musl']),
    )
  } else if (arch === 'arm') {
    candidates.push('@rollup/rollup-linux-arm-gnueabihf', '@rollup/rollup-linux-arm-musleabihf')
  }
} else if (platform === 'darwin') {
  if (arch === 'arm64') candidates.push('@rollup/rollup-darwin-arm64')
  else if (arch === 'x64') candidates.push('@rollup/rollup-darwin-x64')
} else if (platform === 'win32') {
  if (arch === 'x64') candidates.push('@rollup/rollup-win32-x64-msvc', '@rollup/rollup-win32-x64-gnu')
  else if (arch === 'arm64') candidates.push('@rollup/rollup-win32-arm64-msvc')
  else if (arch === 'ia32') candidates.push('@rollup/rollup-win32-ia32-msvc')
}

for (const pkg of candidates) {
  const r = spawnSync(
    'npm',
    // --ignore-scripts: avoid re-entrancy into this postinstall while fixing optional deps
    ['install', '--no-save', '--ignore-scripts', `${pkg}@${rollupVersion}`],
    { stdio: 'inherit', shell: true, cwd: process.cwd() },
  )
  if (r.status === 0 && rollupNativeLoads()) {
    process.exit(0)
  }
}

process.exit(0)
