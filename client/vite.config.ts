import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

function normalizeBase(raw: string): string {
    if (!raw || raw === '/') return '/'
    return raw.endsWith('/') ? raw : `${raw}/`
}

function readBackendPort(): string {
    if (process.env.PORT) return process.env.PORT
    const candidates = [
        path.resolve(__dirname, '..', 'data', 'config', 'runtime-settings.json'),
        path.resolve(__dirname, '..', 'runtime-settings.json')
    ]
    for (const p of candidates) {
        try {
            const raw = fs.readFileSync(p, 'utf8')
            const j = JSON.parse(raw) as { PORT?: string }
            if (j.PORT) return String(j.PORT)
        } catch {
            // try next path
        }
    }
    return '3001'
}

export default defineConfig(() => {
    const targetPort = readBackendPort()
    const isDemo = process.env.VITE_DEMO === 'true'
    const baseFromEnv = process.env.VITE_BASE || process.env.GITHUB_PAGES_BASE
    const base = baseFromEnv ? normalizeBase(baseFromEnv) : '/'

    const pwaPlugin = VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
            enabled: true
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
            name: 'Israeli Bank Scraper',
            short_name: 'BankScraper',
            description: 'Scrape and analyze your Israeli bank and credit card transactions',
            theme_color: '#0f172a',
            background_color: '#0f172a',
            display: 'standalone',
            scope: base,
            start_url: base,
            icons: [
                {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png'
                },
                {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png'
                },
                {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable'
                }
            ]
        }
    })

    return {
        base,
        plugins: [react(), ...(isDemo ? [] : [pwaPlugin])],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                'react': path.resolve(__dirname, '../node_modules/react'),
                'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
            },
        },
        optimizeDeps: {
            include: ['@app/shared'],
        },
        server: {
            port: 5173,
            host: '127.0.0.1',
            proxy: {
                '/api': {
                    target: `http://127.0.0.1:${targetPort}`,
                    changeOrigin: true
                },
                '/socket.io': {
                    target: `ws://127.0.0.1:${targetPort}`,
                    ws: true,
                    changeOrigin: true
                }
            }
        }
    }
})
