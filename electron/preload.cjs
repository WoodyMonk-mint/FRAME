const { contextBridge, ipcRenderer } = require('electron')
const { version } = require('../package.json')

console.log('[preload] loading, version:', version)

try {
  contextBridge.exposeInMainWorld('frame', {
    version,
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    db: {
      getStatus:       ()          => ipcRenderer.invoke('db:get-status'),
      setup:           (opts)      => ipcRenderer.invoke('db:setup', opts),
      wipeAndReset:    ()          => ipcRenderer.invoke('db:wipe-and-reset'),
      loadAll:         ()          => ipcRenderer.invoke('db:load-all'),
      loadTaxonomy:    ()          => ipcRenderer.invoke('db:load-taxonomy'),
      saveTaxonomy:    (entries)   => ipcRenderer.invoke('db:save-taxonomy', entries),
      loadPicklists:   ()          => ipcRenderer.invoke('db:load-picklists'),
      savePicklists:   (lists)     => ipcRenderer.invoke('db:save-picklists', lists),
      saveProject:     (p)         => ipcRenderer.invoke('db:save-project', p),
      saveMap:         (map)       => ipcRenderer.invoke('db:save-map', map),
      deleteMap:       (mapId)     => ipcRenderer.invoke('db:delete-map', mapId),
      deleteProject:   (projectId) => ipcRenderer.invoke('db:delete-project', projectId),
      getPaths:        ()          => ipcRenderer.invoke('db:get-paths'),
      exportDb:        ()          => ipcRenderer.invoke('db:export'),
      importDb:        ()          => ipcRenderer.invoke('db:import'),
      restoreBackup:   ()          => ipcRenderer.invoke('db:restore-backup'),
      listBackups:     ()          => ipcRenderer.invoke('db:list-backups'),
      restoreSpecific: (filePath)  => ipcRenderer.invoke('db:restore-specific', filePath),
      moveDb:          ()          => ipcRenderer.invoke('db:move'),
    },
  })
  console.log('[preload] window.frame exposed OK')
} catch (e) {
  console.error('[preload] contextBridge failed:', e)
}

