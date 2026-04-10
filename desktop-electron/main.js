const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const Store = require('electron-store');

const store = new Store({
    defaults: {
        closeToTray: true,
        firstRunDone: false,
    },
});

/** Install root: packaged = extraResources dir (parent of server/); dev = repo root. */
function getInstallRoot() {
    if (app.isPackaged) {
        return process.resourcesPath;
    }
    return path.join(__dirname, '..');
}

function expandWindowsEnvInPath(s) {
    if (process.platform !== 'win32') return s;
    return s.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}

/** `~/...` (macOS/Linux) and `%VAR%` (Windows) in financial-overview.json paths. */
function expandHomeInPath(s) {
    if (!s || typeof s !== 'string') return s;
    const t = s.trim();
    if (t === '~') return os.homedir();
    if (t.startsWith('~/')) return path.join(os.homedir(), t.slice(2));
    return expandWindowsEnvInPath(t);
}

function defaultDataDir() {
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'FinancialOverview', 'data');
    }
    if (process.platform === 'darwin') {
        return path.join(process.env.HOME || os.homedir(), 'Library', 'Application Support', 'FinancialOverview', 'data');
    }
    return path.join(os.homedir(), '.local', 'share', 'FinancialOverview', 'data');
}

/**
 * Same rules as launch-FinancialOverview.ps1 + server runtimeEnv (OS env wins).
 */
function buildServerEnv(installRoot) {
    const env = { ...process.env, NODE_ENV: 'production' };
    const cfgPath = path.join(installRoot, 'financial-overview.json');

    if (fs.existsSync(cfgPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (cfg.port != null && cfg.port !== '' && process.env.PORT === undefined) {
                env.PORT = String(cfg.port);
            }
            if (
                cfg.dataDir != null &&
                typeof cfg.dataDir === 'string' &&
                cfg.dataDir.trim() !== '' &&
                process.env.DATA_DIR === undefined
            ) {
                env.DATA_DIR = expandHomeInPath(cfg.dataDir.trim());
            }
        } catch (_) {
            /* ignore */
        }
    }

    if (!env.DATA_DIR) {
        env.DATA_DIR = defaultDataDir();
    }

    return env;
}

function getListenPort(serverEnv) {
    const raw = serverEnv.PORT || '3000';
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : 3000;
}

/** Match server: PORT can come from DATA_DIR/config/runtime-settings.json */
function getListenPortForWait(installRoot) {
    const env = { ...buildServerEnv(installRoot) };
    const dataDir = env.DATA_DIR || defaultDataDir();
    try {
        const rs = path.join(path.resolve(dataDir), 'config', 'runtime-settings.json');
        if (fs.existsSync(rs)) {
            const j = JSON.parse(fs.readFileSync(rs, 'utf8'));
            if (j.PORT != null && String(j.PORT).trim() !== '') {
                env.PORT = String(j.PORT).trim();
            }
        }
    } catch (_) {
        /* ignore */
    }
    return getListenPort(env);
}

function waitForHttp(port, timeoutMs = 120000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const ping = () => {
            const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
                res.resume();
                resolve();
            });
            req.on('error', () => {
                if (Date.now() - started > timeoutMs) {
                    reject(new Error(`Server did not respond on port ${port} within ${timeoutMs}ms`));
                } else {
                    setTimeout(ping, 400);
                }
            });
        };
        ping();
    });
}

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
/** Used to respawn the Node server after Maintenance "Restart server" */
let lastInstallRoot = null;

const ELECTRON_RESTART_EXIT_CODE = 88;

function getAppIconPath() {
    const root = getInstallRoot();
    const candidates = [
        path.join(root, 'app.ico'),
        path.join(__dirname, '..', 'client', 'public', 'favicon.ico'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/** Taskbar / window chrome on Windows uses BrowserWindow `icon`, not only the tray. */
function getAppIconNativeImage() {
    const iconPath = getAppIconPath();
    if (!iconPath) return undefined;
    const img = nativeImage.createFromPath(iconPath);
    return img.isEmpty() ? undefined : img;
}

function buildTrayMenu() {
    const closeToTray = store.get('closeToTray');
    return Menu.buildFromTemplate([
        {
            label: 'Open Financial Overview',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: closeToTray ? 'Close to tray: On' : 'Close to tray: Off',
            click: () => {
                const next = !store.get('closeToTray');
                store.set('closeToTray', next);
                if (mainWindow) {
                    mainWindow.webContents.send('desktop:close-to-tray-changed', next);
                }
                if (tray) tray.setContextMenu(buildTrayMenu());
            },
        },
        { type: 'separator' },
        {
            label: 'Quit (stop server)',
            click: () => quitFully(),
        },
    ]);
}

function createTray() {
    if (tray) return;
    const iconPath = getAppIconPath();
    let img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    if (img.isEmpty()) {
        img = nativeImage.createFromDataURL(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        );
    }
    tray = new Tray(img);
    tray.setToolTip('Financial Overview');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

function resolveBundledNodeBinary(installRoot) {
    const winBin = path.join(installRoot, 'runtime', 'node', 'node.exe');
    if (process.platform === 'win32' && fs.existsSync(winBin)) {
        return winBin;
    }
    const unixBin = path.join(installRoot, 'runtime', 'node', 'bin', 'node');
    if (fs.existsSync(unixBin)) {
        return unixBin;
    }
    return null;
}

function spawnServer(installRoot) {
    lastInstallRoot = installRoot;
    const serverJs = path.join(installRoot, 'server', 'dist', 'index.js');
    if (!fs.existsSync(serverJs)) {
        throw new Error(`Server build not found: ${serverJs}`);
    }

    const env = { ...buildServerEnv(installRoot), ELECTRON_MANAGED_SERVER: '1' };
    const bundled = resolveBundledNodeBinary(installRoot);
    const useExe = bundled || 'node';

    const spawnOpts = {
        cwd: installRoot,
        env,
        stdio: 'ignore',
    };
    if (process.platform === 'win32') {
        spawnOpts.windowsHide = true;
    }

    serverProcess = spawn(useExe, [serverJs], spawnOpts);
    serverProcess.on('error', (err) => {
        console.error('[electron] server spawn error', err);
    });
    serverProcess.on('exit', (code, signal) => {
        serverProcess = null;
        if (isQuitting) return;

        if (code === ELECTRON_RESTART_EXIT_CODE && lastInstallRoot) {
            try {
                spawnServer(lastInstallRoot);
                const port = getListenPortForWait(lastInstallRoot);
                waitForHttp(port)
                    .then(() => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.reloadIgnoringCache();
                        }
                    })
                    .catch((e) => {
                        dialog.showErrorBox(
                            'Financial Overview',
                            `Server did not come back after restart.\n\n${(e && e.message) || String(e)}`
                        );
                    });
            } catch (e) {
                dialog.showErrorBox(
                    'Financial Overview',
                    `Failed to restart server.\n\n${(e && e.message) || String(e)}`
                );
            }
            return;
        }

        if (code !== 0 && signal == null) {
            dialog.showErrorBox(
                'Financial Overview',
                `The server exited unexpectedly (code ${code}). Check logs under your data folder.`
            );
        }
    });
}

function killServer() {
    if (serverProcess) {
        try {
            serverProcess.kill('SIGTERM');
        } catch (_) {
            /* ignore */
        }
        serverProcess = null;
    }
}

function quitFully() {
    isQuitting = true;
    destroyTray();
    killServer();
    app.quit();
}

function createWindow(loadUrl) {
    const winIcon = getAppIconNativeImage();
    const winOpts = {
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    };
    if (winIcon) {
        winOpts.icon = winIcon;
    }
    mainWindow = new BrowserWindow(winOpts);
    mainWindow.loadURL(loadUrl);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('close', (e) => {
        if (isQuitting) return;
        if (store.get('closeToTray')) {
            e.preventDefault();
            mainWindow.hide();
            createTray();
        }
    });
}

async function runFirstRunDialog() {
    if (store.get('firstRunDone')) return;
    const res = await dialog.showMessageBox({
        type: 'info',
        title: 'Financial Overview',
        message: 'Desktop app',
        detail:
            'Closing the window can keep the server running in the background so scheduled scrapes and the Telegram bot continue.\n\n' +
            'You can change this anytime in Maintenance or from the tray icon.',
        checkboxLabel: 'Keep server running when I close the window (close to tray)',
        checkboxChecked: true,
        buttons: ['OK'],
        defaultId: 0,
        noLink: true,
    });
    store.set('closeToTray', res.checkboxChecked !== false);
    store.set('firstRunDone', true);
}

async function startApp() {
    const installRoot = getInstallRoot();
    const port = getListenPortForWait(installRoot);

    await runFirstRunDialog();

    const devUrl = process.env.ELECTRON_DEV_URL || 'http://localhost:5173/';
    const skipServer = process.env.ELECTRON_DEV === '1' || process.env.ELECTRON_DEV === 'true';

    let loadUrl = `http://127.0.0.1:${port}/`;

    if (skipServer) {
        loadUrl = devUrl;
    } else {
        try {
            spawnServer(installRoot);
        } catch (e) {
            await dialog.showErrorBox('Financial Overview', (e && e.message) || String(e));
            app.quit();
            return;
        }
        try {
            await waitForHttp(port);
        } catch (e) {
            await dialog.showErrorBox(
                'Financial Overview',
                `Could not start the app server.\n\n${(e && e.message) || String(e)}\n\n` +
                    `If port ${port} is in use, change it in financial-overview.json or stop the other process.`
            );
            killServer();
            app.quit();
            return;
        }
    }

    createWindow(loadUrl);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Always show tray so users see the app (and server) is running — not only after "close to tray".
    if (!skipServer) {
        createTray();
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    // Taskbar grouping / correct icon on Windows (must be set before windows are created).
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.financialoverview.desktop');
    }

    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        ipcMain.handle('desktop:get-close-to-tray', () => store.get('closeToTray'));
        ipcMain.handle('desktop:set-close-to-tray', (_e, value) => {
            store.set('closeToTray', Boolean(value));
            if (mainWindow) {
                mainWindow.webContents.send('desktop:close-to-tray-changed', Boolean(value));
            }
            if (tray) tray.setContextMenu(buildTrayMenu());
            return store.get('closeToTray');
        });

        startApp().catch((err) => {
            console.error(err);
            dialog.showErrorBox('Financial Overview', (err && err.message) || String(err));
            app.quit();
        });
    });

    app.on('before-quit', () => {
        isQuitting = true;
        killServer();
    });

    app.on('window-all-closed', () => {
        if (isQuitting) return;
        if (!store.get('closeToTray')) {
            quitFully();
        }
    });
}
