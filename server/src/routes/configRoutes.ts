import { Router } from 'express';
import { ConfigService } from '../services/configService.js';

const router = Router();
const configService = new ConfigService();

router.get('/env', async (req, res) => {
    try {
        const env = await configService.getEnv();
        res.json({ success: true, data: env });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/env', async (req, res) => {
    try {
        const updates = req.body;
        await configService.updateEnv(updates);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/restart', (req, res) => {
    try {
        res.json({ success: true, message: 'Server restarting...' });
        configService.restart();
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export const configRoutes = router;
