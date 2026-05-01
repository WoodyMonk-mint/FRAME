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
      createCategory:  (input)         => ipcRenderer.invoke('db:create-category', input),
      updateCategory:  (id, patch)     => ipcRenderer.invoke('db:update-category', id, patch),
      listAssignees:   ()              => ipcRenderer.invoke('db:list-assignees'),
      createAssignee:  (input)         => ipcRenderer.invoke('db:create-assignee', input),
      updateAssignee:  (id, patch)     => ipcRenderer.invoke('db:update-assignee', id, patch),
      listTags:        ()              => ipcRenderer.invoke('db:list-tags'),
      listTagUsage:    ()              => ipcRenderer.invoke('db:list-tag-usage'),
      renameTag:       (oldTag, newTag) => ipcRenderer.invoke('db:rename-tag', oldTag, newTag),
      createTag:       (name)          => ipcRenderer.invoke('db:create-tag', name),
      deleteTag:       (name)          => ipcRenderer.invoke('db:delete-tag', name),
      listTaskHistory: (taskId)        => ipcRenderer.invoke('db:list-task-history', taskId),
      takeSnapshot:    (snapshotDate)  => ipcRenderer.invoke('db:take-snapshot', snapshotDate),
      listOverdueTrend: (monthsBack)   => ipcRenderer.invoke('db:list-overdue-trend', monthsBack),
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
      getWorkflowTemplate:    (id)     => ipcRenderer.invoke('db:get-workflow-template', id),
      createWorkflowTemplate: (input)  => ipcRenderer.invoke('db:create-workflow-template', input),
      updateWorkflowTemplate: (id, p)  => ipcRenderer.invoke('db:update-workflow-template', id, p),
      createWorkflowTemplateStep: (templateId, input) =>
        ipcRenderer.invoke('db:create-workflow-template-step', templateId, input),
      updateWorkflowTemplateStep: (stepId, patch) =>
        ipcRenderer.invoke('db:update-workflow-template-step', stepId, patch),
      deleteWorkflowTemplateStep: (stepId) =>
        ipcRenderer.invoke('db:delete-workflow-template-step', stepId),
      reorderWorkflowTemplateSteps: (templateId, orderedStepIds) =>
        ipcRenderer.invoke('db:reorder-workflow-template-steps', templateId, orderedStepIds),
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
