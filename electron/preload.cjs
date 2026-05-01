const { contextBridge, ipcRenderer } = require('electron')
const { version } = require('../package.json')

console.log('[preload] loading, version:', version)

try {
  contextBridge.exposeInMainWorld('frame', {
    version,
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    app: {
      saveCsv: (content, suggestedName) => ipcRenderer.invoke('app:save-csv', content, suggestedName),
    },
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

      // Domain — Iteration 1+
      listTasks:       ()              => ipcRenderer.invoke('db:list-tasks'),
      listCategories:  ()              => ipcRenderer.invoke('db:list-categories'),
      listAssignees:   ()              => ipcRenderer.invoke('db:list-assignees'),
      listTags:        ()              => ipcRenderer.invoke('db:list-tags'),
      createTask:      (input)         => ipcRenderer.invoke('db:create-task', input),
      updateTask:      (id, patch)     => ipcRenderer.invoke('db:update-task', id, patch),
      softDeleteTask:  (id)            => ipcRenderer.invoke('db:soft-delete-task', id),

      // Recurring tasks — Iteration 4
      listRecurrenceTemplates:  ()                    => ipcRenderer.invoke('db:list-recurrence-templates'),
      getRecurrenceTemplate:    (id)                  => ipcRenderer.invoke('db:get-recurrence-template', id),
      createRecurrenceTemplate: (input)               => ipcRenderer.invoke('db:create-recurrence-template', input),
      updateRecurrenceTemplate: (id, patch)           => ipcRenderer.invoke('db:update-recurrence-template', id, patch),
      softDeleteRecurrenceTemplate: (id)              => ipcRenderer.invoke('db:soft-delete-recurrence-template', id),
      completeRecurringOccurrence: (taskId, completedDate, note, createNext) =>
        ipcRenderer.invoke('db:complete-recurring-occurrence', taskId, completedDate, note, createNext),
      reorderChecklist:         (parentId, orderedTaskIds) =>
        ipcRenderer.invoke('db:reorder-checklist', parentId, orderedTaskIds),

      // Workflows — Iteration 3
      listWorkflowTemplates:  ()       => ipcRenderer.invoke('db:list-workflow-templates'),
      listWorkflowInstances:  ()       => ipcRenderer.invoke('db:list-workflow-instances'),
      createWorkflowInstance: (input)  => ipcRenderer.invoke('db:create-workflow-instance', input),
      getWorkflowInstance:    (id)     => ipcRenderer.invoke('db:get-workflow-instance', id),
      updateWorkflowInstance: (id, patch) =>
        ipcRenderer.invoke('db:update-workflow-instance', id, patch),
      softDeleteWorkflowInstance: (id) =>
        ipcRenderer.invoke('db:soft-delete-workflow-instance', id),
      addWorkflowStep:        (instanceId, input) =>
        ipcRenderer.invoke('db:add-workflow-step', instanceId, input),
      listWorkflowNotes:      (instanceId) =>
        ipcRenderer.invoke('db:list-workflow-notes', instanceId),
      addWorkflowNote:        (instanceId, note, author) =>
        ipcRenderer.invoke('db:add-workflow-note', instanceId, note, author),
      reorderWorkflowSteps:   (instanceId, orderedTaskIds, reason) =>
        ipcRenderer.invoke('db:reorder-workflow-steps', instanceId, orderedTaskIds, reason),
    },
  })
  console.log('[preload] window.frame exposed OK')
} catch (e) {
  console.error('[preload] contextBridge failed:', e)
}
