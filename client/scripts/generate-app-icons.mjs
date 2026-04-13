/**
 * Generates favicon, PWA, and touch icons from client/public/download.png,
 * or from mask-icon.svg if download.png is missing.
 * Run: npm run icons:generate -w client
 *
 * favicon.ico includes 512×512 (required for macOS electron-builder) and 256×256 (Windows) plus smaller sizes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')
const downloadPng = path.join(publicDir, 'download.png')
const maskSvg = path.join(publicDir, 'mask-icon.svg')

function resolveSource() {
    if (fs.existsSync(downloadPng)) return downloadPng
    if (fs.existsSync(maskSvg)) return maskSvg
    return null
}

async function main() {
    const srcPath = resolveSource()
    if (!srcPath) {
        console.error('Missing icon source: add client/public/download.png or ensure mask-icon.svg exists.')
        process.exit(1)
    }
    console.log('Using source:', path.relative(path.join(publicDir, '..'), srcPath))

    const pngSizes = [
        ['pwa-192x192.png', 192],
        ['pwa-512x512.png', 512],
        ['apple-touch-icon.png', 180],
        ['favicon-32x32.png', 32],
        ['favicon-16x16.png', 16],
    ]

    for (const [name, size] of pngSizes) {
        await sharp(srcPath)
            .resize(size, size, { fit: 'cover' })
            .png()
            .toFile(path.join(publicDir, name))
        console.log('Wrote', name)
    }

    const icoSizes = [512, 256, 64, 48, 32, 16]
    const buffers = await Promise.all(
        icoSizes.map((size) => sharp(srcPath).resize(size, size, { fit: 'cover' }).png().toBuffer())
    )
    const ico = await pngToIco(buffers)
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico)
    console.log('Wrote favicon.ico (includes 512×512 for macOS Electron, 256×256 for Windows)')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
