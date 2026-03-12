import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
    // Load env variables from the root .env file
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
    const targetPort = env.PORT || 3000

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
        server: {
            proxy: {
                '/api': `http://localhost:${targetPort}`,
                '/socket.io': {
                    target: `ws://localhost:${targetPort}`,
                    ws: true
                }
            }
        }
    }
})
