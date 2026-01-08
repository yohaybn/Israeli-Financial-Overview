import './loadEnv.js'; // MUST BE FIRST
import express from 'express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
// dotenv handled in loadEnv.js
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Modules
import { initLogger } from './src/logger.js';
import { executeFlow } from './src/scraperFlow.js';
import { saveEncryptedCredentials } from './src/encryption.js';

// Routes
import authRoutes from './src/routes/authRoutes.js';
import configRoutes from './src/routes/configRoutes.js';
import profileRoutes from './src/routes/profileRoutes.js';
import scrapeRoutes from './src/routes/scrapeRoutes.js';
import docsRoutes from './src/routes/docsRoutes.js';
import categorizeRoutes from './src/routes/categorizeRoutes.js';
import analyticsRoutes from './src/routes/analyticsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env loaded via import './loadEnv.js' at top



// Initialize Logger
initLogger();

// --- CLI ---
const argv = yargs(hideBin(process.argv))
    .command('scrape', 'Run the scraper', {
        companyId: { description: 'Bank/Company ID', type: 'string' },
        username: { description: 'Username', type: 'string' },
        password: { description: 'Password', type: 'string' },
        'encrypted-creds-file': { description: 'Path to encrypted credentials file', type: 'string' },
        key: { description: 'Encryption key/password', type: 'string' }
    })
    .command('encrypt', 'Encrypt credentials to a file', {
        username: { description: 'Username', type: 'string', demandOption: true },
        password: { description: 'Password', type: 'string', demandOption: true },
        out: { description: 'Output file path', type: 'string', demandOption: true },
        key: { description: 'Encryption key/password', type: 'string', demandOption: true }
    })
    .help()
    .argv;

// Check if we are running in CLI mode
if (argv._.includes('scrape')) {
    const options = {
        companyId: argv.companyId,
        credentials: {
            username: argv.username,
            password: argv.password
        },
        encryptedCredsFile: argv['encrypted-creds-file'],
        key: argv.key,
        // Defaults
        verbose: true,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        combineInstallments: false,
        showBrowser: false
    };
    // No IO in CLI mode, pass null
    executeFlow(options, null).then(() => process.exit(0));

} else if (argv._.includes('encrypt')) {
    const creds = { username: argv.username, password: argv.password };
    try {
        saveEncryptedCredentials(argv.out, creds, argv.key);
        console.log(`Credentials encrypted and saved to ${argv.out}`);
        process.exit(0);
    } catch (e) {
        console.error('Encryption failed:', e);
        process.exit(1);
    }

} else {
    // --- Server Mode ---
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer);

    app.set('io', io); // Make io available to routes

    io.on('connection', (socket) => {
        console.log('Client connected for real-time logs');
    });

    // Middleware
    function maskSensitiveData(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            return obj.map(maskSensitiveData);
        }

        const masked = {};
        const sensitiveKeys = ['key', 'password', 'credentials', 'clientSecret', 'tokens', 'authCode', 'client_secret'];

        for (const [key, value] of Object.entries(obj)) {
            if (sensitiveKeys.includes(key)) {
                masked[key] = '***MASKED***';
            } else if (key === 'data' && Array.isArray(value) && value.length > 5) {
                masked[key] = `[${value.length} rows]`;
            } else if (typeof value === 'object') {
                masked[key] = maskSensitiveData(value);
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }

    app.use((req, res, next) => {
        const safeUrl = req.url.replace(/([?&](key|password)=)[^&]+/gi, '$1***MASKED***');
        res.on('finish', () => {
            console.log(`[Incoming] ${res.statusCode} ${req.method} ${safeUrl}`);
        });
        next();
    });

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true }));

    app.use((req, res, next) => {
        if (['POST', 'PUT'].includes(req.method) && req.body) {
            const maskedBody = maskSensitiveData(req.body);
            console.log(`[Payload] ${JSON.stringify(maskedBody, null, 2)}`);
        }
        next();
    });


    app.use(express.static(path.join(__dirname, 'public')));

    // Routes
    app.use('/auth', authRoutes);
    app.use('/config', configRoutes);
    app.use('/profiles', profileRoutes);
    app.use('/categorize', categorizeRoutes);
    app.use('/analytics', analyticsRoutes);
    app.use('/', scrapeRoutes); // Contains /scrape, /scrape-all, /upload-result, /definitions
    app.use('/', docsRoutes); // Contains /docs, /readme, /readme-content

    app.get('/health', (req, res) => {
        res.send('OK');
    });

    // OAuth Callback specialized route (can be in authRoutes but redirectUri usually points here)
    // Original index.js had /oauth2callback at root.
    app.get('/oauth2callback', (req, res) => {
        const code = req.query.code;
        if (code) {
            res.send(`
                <html>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #34a853;">Authorization Successful!</h2>
                        <p>Please copy the code below and paste it into the Bank Scraper "Authorization Code" field:</p>
                        <textarea style="width: 80%; height: 100px; font-size: 16px; padding: 10px;" readonly>${code}</textarea>
                        <p style="margin-top: 20px; color: #666;">You can close this window after copying.</p>
                    </body>
                </html>
            `);
        } else {
            res.status(400).send('No code received. Please try again.');
        }
    });
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Access UI at http://localhost:${PORT}`);
    });
}
