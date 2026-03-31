const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDesktop', {
    getCloseToTray: () => ipcRenderer.invoke('desktop:get-close-to-tray'),
    setCloseToTray: (value) => ipcRenderer.invoke('desktop:set-close-to-tray', value),
    onCloseToTrayChanged: (listener) => {
        const channel = 'desktop:close-to-tray-changed';
        const wrapped = (_event, v) => listener(v);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    },
});
