import * as api from './api.js';
import * as ui from './ui.js';

export async function checkAuthStatus() {
    try {
        const data = await api.getAuthStatus();
        ui.updateAuthUI(data.authenticated);
        if (data.folderId) {
            const folderEl = document.getElementById('folderId');
            if (folderEl && !folderEl.value) {
                folderEl.value = data.folderId;
            }
        }
    } catch (e) {
        console.error('Auth check failed', e);
    }
}

export async function disconnectAuth() {
    if (!confirm('Are you sure you want to disconnect?')) return;

    try {
        const data = await api.disconnectAuth();
        if (data.success) {
            ui.showToast('Disconnected successfully', 'success');
            ui.updateAuthUI(false);
        } else {
            ui.showToast('Disconnect failed: ' + data.error, 'error');
        }
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    }
}

export async function startOAuthFlow() {
    const clientId = document.getElementById('clientId').value;
    const clientSecret = document.getElementById('clientSecret').value;
    const redirectUri = document.getElementById('redirectUri').value;

    if (!clientId || !clientSecret) return ui.showToast('Please enter Client ID and Secret', 'error');

    try {
        const data = await api.getAuthUrl(clientId, clientSecret, redirectUri);
        if (data.url) {
            window.open(data.url, '_blank');
        } else {
            ui.showToast('Failed to generate auth URL: ' + data.error, 'error');
        }
    } catch (e) {
        ui.showToast('Error: ' + e.message, 'error');
    }
}

export async function exchangeAndSaveOAuth() {
    const code = document.getElementById('authCode').value;
    const clientId = document.getElementById('clientId').value;
    const clientSecret = document.getElementById('clientSecret').value;
    const redirectUri = document.getElementById('redirectUri').value;
    const folderId = document.getElementById('folderId').value;

    if (!code) return ui.showToast('Please enter Authorization Code', 'error');

    try {
        const tokenData = await api.exchangeToken(code, clientId, clientSecret, redirectUri);
        if (tokenData.error) throw new Error(tokenData.error);

        const saveData = await api.saveOAuthConfig({
            clientId,
            clientSecret,
            tokens: tokenData.tokens,
            folderId
        });

        if (saveData.success) {
            ui.showToast('OAuth Credentials Saved Successfully!', 'success');
            ui.updateAuthUI(true);
        } else {
            ui.showToast('Saved Failed: ' + saveData.error, 'error');
        }

    } catch (e) {
        ui.showToast('OAuth Setup Failed: ' + e.message, 'error');
    }
}
