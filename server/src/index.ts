import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize loggers first
import { serverLogger, clientLogger } from './utils/logger.js';
import { maskSensitiveData } from './utils/masking.js';

// Import services
import { SchedulerService } from './services/schedulerService.js';
import { ScraperService } from './services/scraperService.js';
import { ProfileService } from './services/profileService.js';
import { PipelineController } from './services/pipelineController.js';
import { AiService } from './services/aiService.js';
import { StorageService } from './services/storageService.js';
import { FilterService } from './services/filterService.js';
import { ImportService } from './services/importService.js';

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Initialize services (with dependency injection)
const aiService = new AiService();
const storageService = new StorageService();
const filterService = new FilterService();
const importService = new ImportService(aiService);

const profileService = new ProfileService(); // Assuming default constructor
const scraperService = new ScraperService();
scraperService.setSocketIO(io);

// Initialize Pipeline Controller
const pipelineController = new PipelineController({
    scraperService,
    profileService,
    io,
});

const schedulerService = new SchedulerService(scraperService, profileService, pipelineController);

// Export io for use in routes/services
export { io };

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request/Response logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const { method, url, body, query } = req;

    // Log request
    serverLogger.info(`Incoming ${method} ${url}`, {
        body: maskSensitiveData(body),
        query: maskSensitiveData(query)
    });

    // Capture response data
    const oldSend = res.send;
    res.send = function (data) {
        const duration = Date.now() - start;
        let parsedData = data;
        try {
            if (typeof data === 'string') parsedData = JSON.parse(data);
        } catch (e) { }

        serverLogger.info(`Outgoing ${method} ${url} - ${res.statusCode} (${duration}ms)`, {
            data: maskSensitiveData(parsedData)
        });

        return oldSend.apply(res, arguments as any);
    };

    next();
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// Dynamic imports for routes to ensure environment variables are loaded
const { createScrapeRoutes } = await import('./routes/scrapeRoutes.js');
const { profileRoutes } = await import('./routes/profileRoutes.js');
const { aiRoutes } = await import('./routes/aiRoutes.js');
const { aiLogRoutes } = await import('./routes/aiLogRoutes.js');
const { authRoutes } = await import('./routes/authRoutes.js');
const { sheetsRoutes } = await import('./routes/sheetsRoutes.js');
const { logRoutes } = await import('./routes/logRoutes.js');
const { createSchedulerRoutes } = await import('./routes/schedulerRoutes.js');
const { createPipelineRoutes } = await import('./routes/pipelineRoutes.js');
const { configRoutes } = await import('./routes/configRoutes.js');

app.use('/api', createScrapeRoutes(
    scraperService,
    storageService,
    filterService,
    aiService,
    importService,
    io
));
app.use('/api/profiles', profileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-logs', aiLogRoutes);
app.use('/api/auth/google', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/scheduler', createSchedulerRoutes(schedulerService));
app.use('/api/pipeline', createPipelineRoutes(pipelineController));
app.use('/api/logs', logRoutes);
app.use('/api/config', configRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    serverLogger.info(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        serverLogger.info(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Use httpServer instead of app.listen
// Use a more robust way to resolve the static path
let STATIC_PATH = path.join(process.cwd(), 'client/dist');

if (process.env.NODE_ENV === 'production') {
    if (!fs.existsSync(STATIC_PATH)) {
        const alternatePath = path.join(__dirname, '../../client/dist');
        if (fs.existsSync(alternatePath)) {
            serverLogger.info(`Primary static path not found, using alternate: ${alternatePath}`);
            STATIC_PATH = alternatePath;
        } else {
            serverLogger.warn(`Static files directory NOT FOUND. Primary: ${STATIC_PATH}, Alternate: ${alternatePath}`);
        }
    } else {
        serverLogger.info(`Serving static files from: ${STATIC_PATH}`);
    }

    app.use(express.static(STATIC_PATH));

    // Handle SPA routing
    app.get('*', (req, res, next) => {
        // Skip API and Socket.IO
        if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
            return next();
        }

        // Don't serve index.html for missing assets or files with extensions
        // This prevents the "Unexpected token '<'" error in browsers
        if (req.path.includes('.') || req.path.startsWith('/assets/')) {
            serverLogger.warn(`Asset not found: ${req.url}`);
            return res.status(404).send('Not found');
        }

        const indexPath = path.join(STATIC_PATH, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            serverLogger.error(`index.html not found at: ${indexPath}`);
            res.status(404).send('Frontend not built. Please run build first.');
        }
    });
}

httpServer.listen(port, () => {
    serverLogger.info(`Server running on http://localhost:${port}`);
    serverLogger.info(`WebSocket ready on ws://localhost:${port}`);
    serverLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    serverLogger.info(`Data Directory: ${process.env.DATA_DIR || './data'}`);
});
