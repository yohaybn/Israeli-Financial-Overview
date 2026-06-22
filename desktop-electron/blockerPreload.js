const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blocker', {
    attemptUnlock: (password) => ipcRenderer.invoke('blocker:attempt-unlock', password),
    onResult: (listener) => {
        const channel = 'blocker:result';
        const wrapped = (_event, result) => listener(result);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    }
});
