import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
    // Load env variables from the root .env file
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
    const targetPort = env.PORT || 3001

    return {
        plugins: [react()],
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
