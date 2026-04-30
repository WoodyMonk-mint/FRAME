const { contextBridge, ipcRenderer } = require('electron')
const { version } = require('../package.json')

console.log('[preload] loading, version:', version)

try {
  contextBridge.exposeInMainWorld('frame', {
    version,
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    db: {
      getStatus:       ()         => ipcRenderer.invoke('db:get-status'),
      setup:           (opts)     => ipcRenderer.invoke('db:setup', opts),
      wipeAndReset:    ()         => ipcRenderer.invoke('db:wipe-and-reset'),
      moveDb:          ()         => ipcRenderer.invoke('db:move'),
      getPaths:        ()         => ipcRenderer.invoke('db:get-paths'),
      exportDb:        ()         => ipcRenderer.invoke('db:export'),
      importDb:        ()         => ipcRenderer.invoke('db:import'),
      restoreBackup:   ()         => ipcRenderer.invoke('db:restore-backup'),
      listBackups:     ()         => ipcRenderer.invoke('db:list-backups'),
      restoreSpecific: (filePath) => ipcRenderer.invoke('db:restore-specific', filePath),
    },
  })
  console.log('[preload] window.frame exposed OK')
} catch (e) {
  console.error('[preload] contextBridge failed:', e)
}
