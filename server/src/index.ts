import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// IMPORTANT: Import routes AFTER dotenv.config() so that services can access environment variables during instantiation
const { scrapeRoutes } = require('./routes/scrapeRoutes');
const { profileRoutes } = require('./routes/profileRoutes');
const { aiRoutes } = require('./routes/aiRoutes');
const { aiLogRoutes } = require('./routes/aiLogRoutes');
const { authRoutes } = require('./routes/authRoutes');
const { sheetsRoutes } = require('./routes/sheetsRoutes');
const { logRoutes } = require('./routes/logRoutes');
import { createSchedulerRoutes } from './routes/schedulerRoutes';
import { createPipelineRoutes } from './routes/pipelineRoutes';
import { SchedulerService } from './services/schedulerService';
import { ScraperService } from './services/scraperService';
import { ProfileService } from './services/profileService';
import { PipelineController } from './services/pipelineController';
import { serverLogger, clientLogger } from './utils/logger';
import { maskSensitiveData } from './utils/masking';

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

app.use('/api', scrapeRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-logs', aiLogRoutes);
app.use('/api/auth/google', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/scheduler', createSchedulerRoutes(schedulerService));
app.use('/api/pipeline', createPipelineRoutes(pipelineController));
app.use('/api/logs', logRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    serverLogger.info(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        serverLogger.info(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Use httpServer instead of app.listen
const STATIC_PATH = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
    serverLogger.info(`Serving static files from: ${STATIC_PATH}`);
    app.use(express.static(STATIC_PATH));

    // Handle SPA routing
    app.get('*', (req, res, next) => {
        if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
            return next();
        }
        res.sendFile(path.join(STATIC_PATH, 'index.html'));
    });
}

httpServer.listen(port, () => {
    serverLogger.info(`Server running on http://localhost:${port}`);
    serverLogger.info(`WebSocket ready on ws://localhost:${port}`);
    serverLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    serverLogger.info(`Data Directory: ${process.env.DATA_DIR || './data'}`);
});
