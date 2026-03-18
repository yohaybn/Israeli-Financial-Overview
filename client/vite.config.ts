import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
    // Load env variables from the root .env file
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
    const targetPort = env.PORT || 3000

    return {
        plugins: [
            react(),
            VitePWA({
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
                    scope: '/',
                    start_url: '/',
                    icons: [
                        {
                            src: '/pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: '/pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        },
                        {
                            src: '/pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable'
                        }
                    ]
                }
            })
        ],
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
        define: {
            '__BACKEND_PORT__': JSON.stringify(targetPort)
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
