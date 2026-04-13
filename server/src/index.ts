import './utils/pdfNodePolyfill.js';
import './runtimeEnv.js';
import './utils/geminiRateLimitCapture.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createSchedulerRoutes } from './routes/schedulerRoutes.js';
import { SchedulerService } from './services/schedulerService.js';
import { ScraperService } from './services/scraperService.js';
import { postScrapeService } from './services/postScrapeService.js';
import { profileService } from './services/profileService.js';
import { StorageService } from './services/storageService.js';
import { FilterService } from './services/filterService.js';
import { AiService } from './services/aiService.js';
import { ImportService } from './services/importService.js';
import { serverLogger } from './utils/logger.js';
import { maskSensitiveData } from './utils/masking.js';
import { runAiMemoryRetentionPrune } from './services/aiMemoryRetention.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main async function
async function startServer() {
  // Import routes AFTER runtimeEnv (see top) so process.env is populated before services load
  const { createScrapeRoutes } = await import('./routes/scrapeRoutes.js');
  const { createPostScrapeRoutes } = await import('./routes/postScrapeRoutes.js');
  const { profileRoutes } = await import('./routes/profileRoutes.js');
  const { aiRoutes } = await import('./routes/aiRoutes.js');
  const { aiLogRoutes } = await import('./routes/aiLogRoutes.js');
  const { scrapeLogRoutes } = await import('./routes/scrapeLogRoutes.js');
  const { authRoutes } = await import('./routes/authRoutes.js');
  const { sheetsRoutes } = await import('./routes/sheetsRoutes.js');
  const { logRoutes } = await import('./routes/logRoutes.js');
  const { telegramRoutes } = await import('./routes/telegramRoutes.js');
  const { createNotificationRoutes } = await import('./routes/notificationRoutes.js');
  const { configRoutes } = await import('./routes/configRoutes.js');
  const { fraudRoutes } = await import('./routes/fraudRoutes.js');
  const { appLockRoutes } = await import('./routes/appLockRoutes.js');
  const { helpRoutes } = await import('./routes/helpRoutes.js');
  const { insightRulesRoutes } = await import('./routes/insightRulesRoutes.js');
  const { createBudgetExportRoutes } = await import('./routes/budgetExportRoutes.js');

  const app = express();
  const rawPort = parseInt(process.env.PORT || '3000', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;

  // Create HTTP server and Socket.IO instance
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Initialize services (with dependency injection)
  const scraperService = new ScraperService();
  scraperService.setSocketIO(io);
  postScrapeService.setSocketIO(io);

  const schedulerService = new SchedulerService(scraperService, profileService);

  app.use(cors());
  app.use(express.json());

  // Request/Response logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, url, body, query } = req;

    // Check if it's a frequent/scheduled request that should be logged at debug level
    const isDebugEndpoint = url && (
      url.startsWith('/api/logs') ||
      url.startsWith('/api/ai-logs') ||
      url.startsWith('/api/scrape-logs') ||
      url.startsWith('/api/telegram/status') ||
      url.startsWith('/api/telegram/bot-info') ||
      url.startsWith('/api/telegram/bot-avatar') ||
      url.startsWith('/api/app-lock/status') ||
      url.includes('/settings')
    );

    // Log request
    if (isDebugEndpoint) {
      serverLogger.debug(`Incoming ${method} ${url}`, {
        body: maskSensitiveData(body),
        query: maskSensitiveData(query)
      });
    } else {
      serverLogger.info(`Incoming ${method} ${url}`, {
        body: maskSensitiveData(body),
        query: maskSensitiveData(query)
      });
    }

    // Capture response data
    const oldSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - start;
      let parsedData = data;
      try {
        if (typeof data === 'string') parsedData = JSON.parse(data);
      } catch (e) { }

      if (isDebugEndpoint) {
        serverLogger.debug(`Outgoing ${method} ${url} - ${res.statusCode} (${duration}ms)`, {
          data: maskSensitiveData(parsedData)
        });
      } else {
        serverLogger.info(`Outgoing ${method} ${url} - ${res.statusCode} (${duration}ms)`, {
          data: maskSensitiveData(parsedData)
        });
      }

      return oldSend.apply(res, arguments as any);
    };

    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
  });

  app.use('/api/app-lock', appLockRoutes);

  app.use(
    '/api',
    createScrapeRoutes(scraperService, new StorageService(), new FilterService(), new AiService(), new ImportService(), io, schedulerService)
  );
  app.use('/api/post-scrape', createPostScrapeRoutes());
  app.use('/api/profiles', profileRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/ai-logs', aiLogRoutes);
  app.use('/api/scrape-logs', scrapeLogRoutes);
  app.use('/api/auth/google', authRoutes);
  app.use('/api/sheets', sheetsRoutes);
  app.use('/api/scheduler', createSchedulerRoutes(schedulerService));
  app.use('/api/telegram', telegramRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/notifications', createNotificationRoutes());
  app.use('/api/config', configRoutes);
  app.use('/api/fraud', fraudRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/insight-rules', insightRulesRoutes);
  app.use('/api/budget-export', createBudgetExportRoutes());

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
    void runAiMemoryRetentionPrune();
    setInterval(() => void runAiMemoryRetentionPrune(), 24 * 60 * 60 * 1000);
  });
}

// Start the server
startServer().catch((error) => {
  serverLogger.error('Failed to start server', { error });
  process.exit(1);
});
