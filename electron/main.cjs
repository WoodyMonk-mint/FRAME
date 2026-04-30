const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !!process.env.VITE_DEV_SERVER_URL

// ─── Database state ───────────────────────────────────────────────────────────

let db            = null
let dbPath        = null
let backupPath    = null
let backupsDir    = null
let dbStatus      = 'checking'   // 'checking' | 'first-run' | 'ready' | 'missing' | 'corrupt'
let dbStatusError = null

// ─── Config (stores chosen DB path across launches) ──────────────────────────

function getConfigPath() {
  return path.join(app.getPath('userData'), 'frame-config.json')
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
  } catch {
    return null
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (err) {
    console.error('[DB] Could not save config:', err.message)
  }
}

function getDefaultDbPath() {
  return path.join(app.getPath('userData'), 'frame.db')
}

// ─── Path setup ───────────────────────────────────────────────────────────────

function setupPaths(chosenDbPath) {
  dbPath     = chosenDbPath
  backupPath = path.join(path.dirname(chosenDbPath), 'frame-backup.db')
  backupsDir = path.join(path.dirname(chosenDbPath), 'backups')
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

function taskRowToObject(r, assignees) {
  return {
    id:               r.id,
    type:             r.type,
    categoryId:       r.category_id,
    categoryName:     r.category_name ?? null,
    title:            r.title,
    description:      r.description,
    status:           r.status,
    priority:         r.priority,
    primaryOwner:     r.primary_owner,
    assignees:        assignees ?? [],
    dueDate:          r.due_date,
    completedDate:    r.completed_date,
    percentComplete:  r.percent_complete ?? 0,
    notes:            r.notes,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  }
}

function getTaskById(id) {
  if (!db) return null
  const r = db.prepare(`
    SELECT t.*, c.name AS category_name
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ? AND t.is_deleted = 0
  `).get(id)
  if (!r) return null
  const assignees = db.prepare('SELECT name FROM task_assignees WHERE task_id = ?').all(id).map(x => x.name)
  return taskRowToObject(r, assignees)
}

// ─── Backup ───────────────────────────────────────────────────────────────────

function createSessionBackup() {
  if (!dbPath || !fs.existsSync(dbPath)) return
  try {
    fs.mkdirSync(backupsDir, { recursive: true })
    fs.copyFileSync(dbPath, backupPath)

    const stamp  = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const tsPath = path.join(backupsDir, `frame-${stamp}.db`)
    fs.copyFileSync(dbPath, tsPath)

    const existing = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('frame-') && f.endsWith('.db'))
      .sort()
    if (existing.length > 10) {
      existing.slice(0, existing.length - 10)
        .forEach(f => fs.unlinkSync(path.join(backupsDir, f)))
    }
    console.log('[DB] Session backup saved:', tsPath)
  } catch (err) {
    console.warn('[DB] Backup failed:', err.message)
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function runSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      sort_order  INTEGER,
      colour      TEXT,
      is_archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assignees (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      is_active   INTEGER DEFAULT 1,
      sort_order  INTEGER
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      gate_type   TEXT,
      description TEXT,
      category_id INTEGER REFERENCES categories(id),
      is_archived INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_template_steps (
      id            INTEGER PRIMARY KEY,
      template_id   INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
      step_number   INTEGER NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT,
      default_owner TEXT,
      offset_days   INTEGER,
      is_optional   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workflow_instances (
      id          INTEGER PRIMARY KEY,
      template_id INTEGER REFERENCES workflow_templates(id),
      name        TEXT NOT NULL,
      gate_type   TEXT,
      project_ref TEXT,
      start_date  TEXT,
      target_date TEXT,
      status      TEXT DEFAULT 'WIP',
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id                   INTEGER PRIMARY KEY,
      type                 TEXT NOT NULL,
      category_id          INTEGER REFERENCES categories(id),
      workflow_instance_id INTEGER REFERENCES workflow_instances(id),
      parent_task_id       INTEGER REFERENCES tasks(id),
      title                TEXT NOT NULL,
      description          TEXT,
      status               TEXT NOT NULL DEFAULT 'PLANNING',
      priority             TEXT,
      primary_owner        TEXT REFERENCES assignees(name),
      due_date             TEXT,
      completed_date       TEXT,
      percent_complete     INTEGER DEFAULT 0,
      recurrence_type      TEXT,
      recurrence_interval  INTEGER,
      recurrence_unit      TEXT,
      recurrence_anchor    TEXT,
      next_due_date        TEXT,
      auto_create_next     INTEGER DEFAULT 1,
      blocked_reason       TEXT,
      blocked_by_task_id   INTEGER REFERENCES tasks(id),
      notes                TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
      is_deleted           INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workflow_instance_steps (
      id               INTEGER PRIMARY KEY,
      instance_id      INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      template_step_id INTEGER REFERENCES workflow_template_steps(id),
      task_id          INTEGER REFERENCES tasks(id),
      step_number      INTEGER NOT NULL,
      is_deviation     INTEGER DEFAULT 0,
      deviation_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_notes (
      id          INTEGER PRIMARY KEY,
      instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
      note        TEXT NOT NULL,
      author      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      id      INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      name    TEXT NOT NULL REFERENCES assignees(name)
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      id      INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_commitments (
      id           INTEGER PRIMARY KEY,
      task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      month        TEXT NOT NULL,
      committed    INTEGER DEFAULT 0,
      committed_at TEXT,
      notes        TEXT,
      UNIQUE (task_id, month)
    );

    CREATE TABLE IF NOT EXISTS task_snapshots (
      id               INTEGER PRIMARY KEY,
      snapshot_date    TEXT NOT NULL,
      task_id          INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status           TEXT,
      percent_complete INTEGER,
      due_date         TEXT,
      primary_owner    TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY,
      table_name  TEXT NOT NULL,
      row_id      INTEGER NOT NULL,
      action      TEXT NOT NULL,
      changed_by  TEXT,
      changed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      old_values  TEXT,
      new_values  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_category    ON tasks(category_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_workflow    ON tasks(workflow_instance_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignees    ON task_assignees(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_tags         ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_table_row   ON audit_log(table_name, row_id);

    CREATE VIEW IF NOT EXISTS v_overdue_tasks AS
      SELECT t.*, c.name AS category_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.status NOT IN ('DONE','CANCELLED')
        AND t.is_deleted = 0
        AND t.due_date IS NOT NULL
        AND t.due_date < date('now');

    CREATE VIEW IF NOT EXISTS v_due_soon AS
      SELECT t.*, c.name AS category_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.status NOT IN ('DONE','CANCELLED')
        AND t.is_deleted = 0
        AND t.due_date IS NOT NULL
        AND t.due_date BETWEEN date('now') AND date('now','+1 day');

    CREATE VIEW IF NOT EXISTS v_workload AS
      SELECT a.name AS assignee, COUNT(*) AS open_tasks
      FROM task_assignees a
      JOIN tasks t ON a.task_id = t.id
      WHERE t.status NOT IN ('DONE','CANCELLED') AND t.is_deleted = 0
      GROUP BY a.name;
  `)
}

// ─── Seed (idempotent) ───────────────────────────────────────────────────────

function seedDatabase() {
  const seed = db.transaction(() => {
    // Categories
    const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n
    if (catCount === 0) {
      const ins = db.prepare('INSERT INTO categories (name, sort_order, colour) VALUES (?, ?, ?)')
      const rows = [
        ['Production Analysis',   1, '#14b8a6'],
        ['Production Processes',  2, '#6366f1'],
        ['Report & Intelligence', 3, '#f59e0b'],
        ['Gate Reviews',          4, '#f43f5e'],
        ['Mandates',              5, '#10b981'],
        ['Admin',                 6, '#64748b'],
      ]
      rows.forEach(r => ins.run(...r))
      console.log('[DB] Seeded 6 categories')
    }

    // Assignees
    const aCount = db.prepare('SELECT COUNT(*) AS n FROM assignees').get().n
    if (aCount === 0) {
      const ins = db.prepare('INSERT INTO assignees (name, sort_order) VALUES (?, ?)')
      const team = ['David', 'Wim', 'Athena', 'Cloud', 'Cathy', 'Alex']
      team.forEach((n, i) => ins.run(n, i + 1))
      console.log('[DB] Seeded 6 assignees')
    }

    // Workflow templates
    const tCount = db.prepare('SELECT COUNT(*) AS n FROM workflow_templates').get().n
    if (tCount === 0) {
      const insTpl  = db.prepare(`
        INSERT INTO workflow_templates (name, gate_type, description, category_id)
        VALUES (?, ?, ?, ?)
      `)
      const insStep = db.prepare(`
        INSERT INTO workflow_template_steps (template_id, step_number, title, default_owner, is_optional)
        VALUES (?, ?, ?, ?, ?)
      `)
      const catId = (name) => db.prepare('SELECT id FROM categories WHERE name = ?').get(name)?.id ?? null

      // Gate Review (gate_type set per instance)
      const gateRes = insTpl.run(
        'Gate Review',
        null,
        'Standard gate review process — gate type (Concept / VS / EFP / FP) set per instance',
        catId('Gate Reviews')
      )
      const gateSteps = [
        [1,  'GR Kickoff',                                              'Alex',  0],
        [2,  'Receive request, confirm assessment goals',               'David', 0],
        [3,  'Review deliverables, check missing with Pteam',           'David', 0],
        [4,  'Build Kick-Off Meeting & GR Deliverables',                'Alex',  0],
        [5,  'Pteam Presentation',                                      'Alex',  0],
        [6,  'Support Pteam: Mandate draft for central team review',    'David', 0],
        [7,  'Discuss within PPM',                                      'David', 0],
        [8,  'Discuss with central teams (GRC, BOS, Finance)',          'David', 1],
        [9,  'Q&A with Pteam',                                          'Alex',  0],
        [10, 'Prep PM feedback, sync with central teams',               'David', 0],
        [11, 'Consolidate PM feedback and share with Yongyi',           'Wim',   0],
        [12, 'Deliver assessment to GR team',                           'David', 0],
        [13, 'Feedback meeting with assessment teams',                  'David', 0],
        [14, 'GR Decision meeting',                                     'Alex',  0],
        [15, 'Support Pteam: finalised Mandate for GR approval',        'David', 0],
      ]
      gateSteps.forEach(([n, t, o, opt]) => insStep.run(gateRes.lastInsertRowid, n, t, o, opt))

      // Production Analysis
      const paRes = insTpl.run(
        'Production Analysis',
        null,
        'Standard production analysis workflow',
        catId('Production Analysis')
      )
      const paSteps = [
        [1, 'Receive request / initiate',         'David', 0],
        [2, 'Assign PoC',                         'David', 0],
        [3, 'Review available materials',         'David', 0],
        [4, 'Playtest / build review',            'David', 1],
        [5, 'Internal PPM discussion',            'David', 0],
        [6, 'Draft assessment',                   'David', 0],
        [7, 'Feedback meeting with studio',       'David', 0],
        [8, 'Finalise and deliver assessment',    'David', 0],
      ]
      paSteps.forEach(([n, t, o, opt]) => insStep.run(paRes.lastInsertRowid, n, t, o, opt))

      console.log('[DB] Seeded 2 workflow templates (Gate Review, Production Analysis)')
    }
  })
  seed()
}

// ─── Core: open, integrity-check, schema, seed ───────────────────────────────

function openAndValidateDb() {
  const Database = require('better-sqlite3')

  createSessionBackup()

  db = new Database(dbPath)

  const check = db.pragma('integrity_check')
  if (!Array.isArray(check) || check[0]?.integrity_check !== 'ok') {
    const detail = JSON.stringify(check)
    db.close(); db = null
    throw new Error(`integrity_check failed: ${detail}`)
  }

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runSchema()
  seedDatabase()

  console.log('[DB] Opened and validated:', dbPath)
}

// ─── Init on launch ───────────────────────────────────────────────────────────

function initDatabase() {
  const config = loadConfig()

  if (!config || !config.dbPath) {
    setupPaths(getDefaultDbPath())
    dbStatus = 'first-run'
    console.log('[DB] First run — awaiting setup')
    return
  }

  setupPaths(config.dbPath)

  if (!fs.existsSync(dbPath)) {
    dbStatus = 'missing'
    console.warn('[DB] Configured DB not found:', dbPath)
    return
  }

  try {
    openAndValidateDb()
    dbStatus = 'ready'
  } catch (err) {
    if (db) { try { db.close() } catch (_) { /* noop */ } db = null }
    dbStatus = 'corrupt'
    dbStatusError = err.message
    console.error('[DB] Validation failed:', err.message)
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {

  // ── DB status & setup ──────────────────────────────────────────────────────

  ipcMain.handle('db:get-status', () => {
    const hasBackup = !!(backupPath && fs.existsSync(backupPath))
    return {
      status:      dbStatus,
      dbPath:      dbPath,
      defaultPath: getDefaultDbPath(),
      hasBackup,
      backupPath:  hasBackup ? backupPath : undefined,
      error:       dbStatusError ?? undefined,
    }
  })

  // action: 'use-default' | 'choose-folder' | 'import'
  ipcMain.handle('db:setup', async (event, opts) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      let targetDir = null

      if (opts.action === 'use-default') {
        targetDir = path.dirname(getDefaultDbPath())

      } else if (opts.action === 'choose-folder') {
        const result = await dialog.showOpenDialog(win, {
          title:       'Choose FRAME data folder',
          buttonLabel: 'Use this folder',
          properties:  ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
        targetDir = result.filePaths[0]

      } else if (opts.action === 'import') {
        const folderResult = await dialog.showOpenDialog(win, {
          title:       'Choose where to store the FRAME database',
          buttonLabel: 'Use this folder',
          properties:  ['openDirectory', 'createDirectory'],
        })
        if (folderResult.canceled || !folderResult.filePaths.length) return { ok: false, cancelled: true }
        targetDir = folderResult.filePaths[0]

        const fileResult = await dialog.showOpenDialog(win, {
          title:      'Select existing FRAME database',
          filters:    [{ name: 'SQLite Database', extensions: ['db'] }],
          properties: ['openFile'],
        })
        if (fileResult.canceled || !fileResult.filePaths.length) return { ok: false, cancelled: true }

        const targetDbPath = path.join(targetDir, 'frame.db')
        fs.mkdirSync(targetDir, { recursive: true })
        fs.copyFileSync(fileResult.filePaths[0], targetDbPath)
        saveConfig({ dbPath: targetDbPath })

        if (db) { try { db.close() } catch (_) { /* noop */ } db = null }
        setupPaths(targetDbPath)

        openAndValidateDb()
        dbStatus = 'ready'
        dbStatusError = null
        return { ok: true, dbPath: targetDbPath }
      }

      const targetDbPath = path.join(targetDir, 'frame.db')
      fs.mkdirSync(targetDir, { recursive: true })
      saveConfig({ dbPath: targetDbPath })

      if (db) { try { db.close() } catch (_) { /* noop */ } db = null }
      setupPaths(targetDbPath)

      openAndValidateDb()
      dbStatus = 'ready'
      dbStatusError = null
      return { ok: true, dbPath: targetDbPath }

    } catch (err) {
      console.error('[DB] Setup failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:wipe-and-reset', async () => {
    try {
      if (db) { try { db.close() } catch (_) { /* noop */ } db = null }
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

      openAndValidateDb()
      dbStatus = 'ready'
      dbStatusError = null
      return { ok: true, dbPath }
    } catch (err) {
      console.error('[DB] Wipe-and-reset failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:move', async (event) => {
    if (!db || !dbPath) return { ok: false, error: 'No database open' }
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win, {
        title:       'Choose new FRAME data folder',
        buttonLabel: 'Move here',
        properties:  ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }

      const newDir    = result.filePaths[0]
      const newDbPath = path.join(newDir, 'frame.db')

      if (newDbPath === dbPath) return { ok: false, error: 'That is already the current database location.' }

      db.pragma('wal_checkpoint(TRUNCATE)')

      fs.mkdirSync(newDir, { recursive: true })
      fs.copyFileSync(dbPath, newDbPath)

      db.close()
      db = null
      const oldPath = dbPath
      setupPaths(newDbPath)
      saveConfig({ dbPath: newDbPath })

      openAndValidateDb()
      dbStatus = 'ready'

      try { fs.unlinkSync(oldPath) } catch (e) {
        console.warn('[DB] Could not remove old database file:', e.message)
      }

      console.log('[DB] Moved to:', newDbPath)
      return { ok: true, dbPath: newDbPath, backupsDir: backupsDir }

    } catch (err) {
      console.error('[DB] Move failed:', err.message)
      if (!db && dbPath && fs.existsSync(dbPath)) {
        try {
          openAndValidateDb()
          dbStatus = 'ready'
        } catch (recoverErr) {
          dbStatus = 'corrupt'
          dbStatusError = recoverErr.message
        }
      }
      return { ok: false, error: err.message }
    }
  })

  // ── Tasks (Iteration 1) ────────────────────────────────────────────────────

  ipcMain.handle('db:list-categories', () => {
    if (!db) return []
    return db.prepare(`
      SELECT id, name, sort_order, colour, is_archived
      FROM categories
      ORDER BY COALESCE(sort_order, 999), name
    `).all().map(r => ({
      id:         r.id,
      name:       r.name,
      sortOrder:  r.sort_order,
      colour:     r.colour,
      isArchived: !!r.is_archived,
    }))
  })

  ipcMain.handle('db:list-assignees', () => {
    if (!db) return []
    return db.prepare(`
      SELECT id, name, is_active, sort_order
      FROM assignees
      WHERE is_active = 1
      ORDER BY COALESCE(sort_order, 999), name
    `).all().map(r => ({
      id:        r.id,
      name:      r.name,
      isActive:  !!r.is_active,
      sortOrder: r.sort_order,
    }))
  })

  ipcMain.handle('db:list-tasks', () => {
    if (!db) return []
    const rows = db.prepare(`
      SELECT t.*, c.name AS category_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.is_deleted = 0
      ORDER BY
        CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
        t.due_date IS NULL,
        t.due_date,
        t.created_at DESC
    `).all()

    if (rows.length === 0) return []

    const ids = rows.map(r => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const assigneeRows = db.prepare(
      `SELECT task_id, name FROM task_assignees WHERE task_id IN (${placeholders})`
    ).all(...ids)

    const assigneesByTaskId = {}
    for (const a of assigneeRows) {
      if (!assigneesByTaskId[a.task_id]) assigneesByTaskId[a.task_id] = []
      assigneesByTaskId[a.task_id].push(a.name)
    }

    return rows.map(r => taskRowToObject(r, assigneesByTaskId[r.id] ?? []))
  })

  ipcMain.handle('db:create-task', (_event, input) => {
    if (!db) return { ok: false, error: 'Database not ready' }
    try {
      let newId
      const tx = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO tasks (
            type, category_id, title, description, status, priority,
            primary_owner, due_date, percent_complete, notes
          ) VALUES (
            'one-off', @categoryId, @title, @description, @status, @priority,
            @primaryOwner, @dueDate, @percentComplete, @notes
          )
        `)
        const result = ins.run({
          categoryId:      input.categoryId ?? null,
          title:           input.title,
          description:     input.description ?? null,
          status:          input.status ?? 'PLANNING',
          priority:        input.priority ?? null,
          primaryOwner:    input.primaryOwner ?? null,
          dueDate:         input.dueDate ?? null,
          percentComplete: input.percentComplete ?? 0,
          notes:           input.notes ?? null,
        })
        newId = Number(result.lastInsertRowid)

        if (Array.isArray(input.assignees) && input.assignees.length) {
          const insA = db.prepare('INSERT INTO task_assignees (task_id, name) VALUES (?, ?)')
          for (const name of input.assignees) insA.run(newId, name)
        }

        const newRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId)
        db.prepare(`
          INSERT INTO audit_log (table_name, row_id, action, changed_by, new_values)
          VALUES ('tasks', ?, 'INSERT', 'user', ?)
        `).run(newId, JSON.stringify({ ...newRow, assignees: input.assignees ?? [] }))
      })
      tx()
      return { ok: true, task: getTaskById(newId) }
    } catch (err) {
      console.error('[DB] create-task failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:update-task', (_event, id, patch) => {
    if (!db) return { ok: false, error: 'Database not ready' }
    try {
      const tx = db.transaction(() => {
        const oldRow = db.prepare('SELECT * FROM tasks WHERE id = ? AND is_deleted = 0').get(id)
        if (!oldRow) throw new Error(`Task ${id} not found`)
        const oldAssignees = db.prepare('SELECT name FROM task_assignees WHERE task_id = ?').all(id).map(r => r.name)

        const setParts = []
        const params = { id }
        const map = {
          title:           'title',
          categoryId:      'category_id',
          primaryOwner:    'primary_owner',
          status:          'status',
          priority:        'priority',
          dueDate:         'due_date',
          percentComplete: 'percent_complete',
          description:     'description',
          notes:           'notes',
          completedDate:   'completed_date',
        }
        for (const [tsKey, sqlKey] of Object.entries(map)) {
          if (Object.prototype.hasOwnProperty.call(patch, tsKey)) {
            setParts.push(`${sqlKey} = @${tsKey}`)
            params[tsKey] = patch[tsKey] ?? null
          }
        }
        setParts.push(`updated_at = datetime('now')`)
        db.prepare(`UPDATE tasks SET ${setParts.join(', ')} WHERE id = @id`).run(params)

        if (Array.isArray(patch.assignees)) {
          db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(id)
          const insA = db.prepare('INSERT INTO task_assignees (task_id, name) VALUES (?, ?)')
          for (const name of patch.assignees) insA.run(id, name)
        }

        const newRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
        const newAssignees = Array.isArray(patch.assignees) ? patch.assignees : oldAssignees
        db.prepare(`
          INSERT INTO audit_log (table_name, row_id, action, changed_by, old_values, new_values)
          VALUES ('tasks', ?, 'UPDATE', 'user', ?, ?)
        `).run(
          id,
          JSON.stringify({ ...oldRow, assignees: oldAssignees }),
          JSON.stringify({ ...newRow, assignees: newAssignees }),
        )
      })
      tx()
      return { ok: true, task: getTaskById(id) }
    } catch (err) {
      console.error('[DB] update-task failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:soft-delete-task', (_event, id) => {
    if (!db) return { ok: false, error: 'Database not ready' }
    try {
      const tx = db.transaction(() => {
        const oldRow = db.prepare('SELECT * FROM tasks WHERE id = ? AND is_deleted = 0').get(id)
        if (!oldRow) throw new Error(`Task ${id} not found`)
        const oldAssignees = db.prepare('SELECT name FROM task_assignees WHERE task_id = ?').all(id).map(r => r.name)

        db.prepare(`UPDATE tasks SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`).run(id)

        db.prepare(`
          INSERT INTO audit_log (table_name, row_id, action, changed_by, old_values)
          VALUES ('tasks', ?, 'DELETE', 'user', ?)
        `).run(id, JSON.stringify({ ...oldRow, assignees: oldAssignees }))
      })
      tx()
      return { ok: true }
    } catch (err) {
      console.error('[DB] soft-delete-task failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // ── Backup / export / import ───────────────────────────────────────────────

  ipcMain.handle('db:get-paths', () => ({
    dbPath:     dbPath,
    backupPath: backupPath,
    backupsDir: backupsDir,
  }))

  ipcMain.handle('db:list-backups', () => {
    if (!backupsDir || !fs.existsSync(backupsDir)) return []
    try {
      return fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('frame-') && f.endsWith('.db'))
        .sort()
        .reverse()
        .map(filename => {
          const fullPath = path.join(backupsDir, filename)
          const stat     = fs.statSync(fullPath)
          const datePart = filename.replace('frame-', '').replace('.db', '')
          const iso      = datePart.slice(0, 10) + 'T' + datePart.slice(11).replace(/-/g, ':')
          return { filename, path: fullPath, size: stat.size, isoDate: iso }
        })
    } catch (err) {
      console.warn('[DB] list-backups failed:', err.message)
      return []
    }
  })

  ipcMain.handle('db:restore-specific', async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'File not found' }
    try {
      if (db) { db.close(); db = null }
      fs.copyFileSync(filePath, dbPath)
      app.relaunch()
      app.quit()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:export', async (event) => {
    if (!db || !dbPath) return { ok: false, error: 'No database open' }
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const dialogOpts = {
        title:       'Export FRAME Database',
        defaultPath: `frame-export-${new Date().toISOString().slice(0, 10)}.db`,
        filters:     [{ name: 'SQLite Database', extensions: ['db'] }],
      }
      const { filePath, canceled } = win
        ? await dialog.showSaveDialog(win, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts)
      if (canceled || !filePath) return { ok: false, cancelled: true }
      db.pragma('wal_checkpoint(TRUNCATE)')
      fs.copyFileSync(dbPath, filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:import', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const dialogOpts = {
        title:      'Import FRAME Database',
        filters:    [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
      }
      const { filePaths, canceled } = win
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts)
      if (canceled || !filePaths?.length) return { ok: false, cancelled: true }
      if (db) { db.close(); db = null }
      fs.copyFileSync(filePaths[0], dbPath)
      app.relaunch()
      app.quit()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('db:restore-backup', async () => {
    if (!backupPath || !fs.existsSync(backupPath)) return { ok: false, error: 'No backup found' }
    try {
      if (db) { db.close(); db = null }
      fs.copyFileSync(backupPath, dbPath)
      app.relaunch()
      app.quit()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('shell:open-external', (_event, url) => {
    const allowed = ['https://github.com/WoodyMonk-mint/FRAME/']
    if (allowed.some((prefix) => url.startsWith(prefix))) {
      shell.openExternal(url)
    }
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:  1440,
    height: 960,
    minWidth:  1200,
    minHeight: 760,
    backgroundColor: '#1a1a1d',
    title: 'FRAME',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// Required on some Windows machines with restricted process sandboxing policies
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
}

app.whenReady().then(() => {
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (db) db.close()
  if (process.platform !== 'darwin') app.quit()
})
