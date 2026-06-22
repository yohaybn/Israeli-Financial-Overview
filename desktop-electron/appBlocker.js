const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let blockerWindow = null;
let currentToken = null;
let tokenExpiryTimer = null;
let isUnlockHandlerRegistered = false;

function createBlockerWindow(port, onSuccess) {
    if (blockerWindow) return blockerWindow;

    blockerWindow = new BrowserWindow({
        fullscreen: true,
        frame: false,
        closable: false,
        minimizable: false,
        maximizable: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        movable: false,
        focusable: true,
        webPreferences: {
            preload: path.join(__dirname, 'blockerPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // Prevent closing unless authenticated
    blockerWindow.on('close', (e) => {
        if (!currentToken) e.preventDefault();
    });

    // Security hardening
    blockerWindow.webContents.on('devtools-opened', () => {
        blockerWindow.webContents.closeDevTools();
    });
    
    blockerWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') event.preventDefault();
        if (input.key === 'F12') event.preventDefault();
        if (input.alt && input.key === 'F4') event.preventDefault();
        if (input.control && input.key.toLowerCase() === 'r') event.preventDefault();
    });

    if (process.platform === 'darwin') {
        blockerWindow.setContentProtection(true);
    }
    blockerWindow.setThumbnailClip({ x: 0, y: 0, width: 1, height: 1 });

    blockerWindow.loadFile(path.join(__dirname, 'blockerPage.html'));

    if (!isUnlockHandlerRegistered) {
        isUnlockHandlerRegistered = true;
        ipcMain.handle('blocker:attempt-unlock', async (event, password) => {
            return new Promise((resolve) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: port,
                    path: '/api/app-lock/unlock',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (res.statusCode === 200 && parsed.success && parsed.token) {
                                currentToken = parsed.token;
                                
                                // Setup expiry re-lock
                                if (tokenExpiryTimer) clearTimeout(tokenExpiryTimer);
                                const msUntilExpiry = Math.max(0, parsed.expiresAt - Date.now());
                                tokenExpiryTimer = setTimeout(() => {
                                    handleTokenExpiry(port, onSuccess);
                                }, msUntilExpiry);

                                if (blockerWindow) {
                                    blockerWindow.webContents.send('blocker:result', { success: true });
                                    setTimeout(() => {
                                        if (blockerWindow) {
                                            blockerWindow.destroy();
                                            blockerWindow = null;
                                            onSuccess();
                                        }
                                    }, 500);
                                }
                                resolve({ success: true });
                            } else {
                                if (blockerWindow) blockerWindow.webContents.send('blocker:result', { 
                                    success: false, 
                                    error: parsed.error,
                                    message: parsed.message || parsed.error,
                                    retryAfterMs: parsed.retryAfterMs 
                                });
                                resolve({ success: false });
                            }
                        } catch (e) {
                            if (blockerWindow) blockerWindow.webContents.send('blocker:result', { success: false, message: 'Invalid response from server' });
                            resolve({ success: false });
                        }
                    });
                });

                req.on('error', (e) => {
                    if (blockerWindow) blockerWindow.webContents.send('blocker:result', { success: false, message: 'Server not ready, try again' });
                    resolve({ success: false });
                });

                req.write(JSON.stringify({ password }));
                req.end();
            });
        });
    }

    return blockerWindow;
}

function handleTokenExpiry(port, onReLock) {
    currentToken = null;
    const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/api/app-lock/lock',
        method: 'POST'
    });
    req.on('error', () => {});
    req.end();
    
    onReLock();
}

function getSessionToken() {
    return currentToken;
}

module.exports = {
    createBlockerWindow,
    getSessionToken,
};
