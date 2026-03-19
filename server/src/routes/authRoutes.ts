import { Router } from 'express';
import { google } from 'googleapis';
import { GoogleAuthService } from '../services/googleAuthService.js';

const router = Router();
const authService = new GoogleAuthService();

// Get Google OAuth URL
router.get('/url', async (req, res) => {
    try {
        const url = await authService.getAuthUrl();
        res.json({ success: true, data: url });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle Google OAuth callback
router.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ success: false, error: 'Code not found' });
    }

    try {
        await authService.setTokensFromCode(code as string);
        // Redirect back to the frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}?auth=success`);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get authentication status
router.get('/status', async (req, res) => {
    try {
        const authenticated = await authService.isAuthenticated();
        res.json({ success: true, data: { authenticated } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET Google settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await authService.getSettings();
        if (settings) {
            // Mask the secret for security
            const maskedSettings = {
                ...settings,
                clientSecret: settings.clientSecret ? '********' : ''
            };
            res.json({ success: true, data: maskedSettings });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST Google settings
router.post('/settings', async (req, res) => {
    try {
        const { clientId, clientSecret, redirectUri } = req.body;

        // If clientSecret is masked '********', don't change it if we have existing settings
        let finalSecret = clientSecret;
        if (clientSecret === '********') {
            const existing = await authService.getSettings();
            finalSecret = existing?.clientSecret || '';
        }

        await authService.updateSettings({
            clientId,
            clientSecret: finalSecret,
            redirectUri: redirectUri || 'http://localhost:3000/api/auth/google/callback'
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Map technical Google OAuth/API errors to user-friendly messages
function getFriendlyDriveTestError(message: string): string {
    const m = (message || '').toLowerCase();
    if (m.includes('invalid_grant') || m.includes('token has been expired') || m.includes('token has been revoked') || m.includes('invalid refresh token')) {
        return 'Your Google sign-in has expired or was revoked. Connect your account again using "Connect with Google" (e.g. in Google Sheets sync).';
    }
    if (m.includes('invalid_client') || m.includes('unauthorized')) {
        return 'Invalid Client ID or Client Secret. Check your credentials in Google Cloud Console.';
    }
    if (m.includes('access_denied') || m.includes('access denied')) {
        return 'Access was denied. Try connecting your Google account again and approve the requested permissions.';
    }
    if (m.includes('invalid_scope')) {
        return 'Required Google Drive permission is missing. Reconnect your account and accept all requested permissions.';
    }
    if (m.includes('econnrefused') || m.includes('enotfound') || m.includes('network')) {
        return 'Network error. Check your internet connection and try again.';
    }
    return message;
}

// Test Google Drive connection
router.get('/test', async (req, res) => {
    try {
        const configured = await authService.isConfigured();
        if (!configured) {
            return res.status(400).json({ success: false, error: 'Google credentials not configured' });
        }
        const authenticated = await authService.isAuthenticated();
        if (!authenticated) {
            return res.status(401).json({ success: false, error: 'Not authenticated with Google. Connect your account first.' });
        }
        const auth = await authService.getClient();
        const drive = google.drive({ version: 'v3', auth });
        await drive.files.list({ pageSize: 1 });
        res.json({ success: true, data: { message: 'Google Drive connection successful' } });
    } catch (error: any) {
        const friendly = getFriendlyDriveTestError(error?.message || String(error));
        res.status(500).json({ success: false, error: friendly });
    }
});

// GET configuration status
router.get('/config-status', async (req, res) => {
    try {
        const configured = await authService.isConfigured();
        res.json({ success: true, data: { configured } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Log out / Revoke auth
router.post('/logout', async (req, res) => {
    try {
        await authService.revokeAuth();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export const authRoutes = router;
