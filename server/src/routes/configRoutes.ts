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

router.get('/dashboard', async (req, res) => {
    try {
        const config = await configService.getDashboardConfig();
        res.json({ success: true, data: config });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/dashboard', async (req, res) => {
    try {
        const updates = req.body;
        const updatedConfig = await configService.updateDashboardConfig(updates);
        res.json({ success: true, data: updatedConfig });
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
