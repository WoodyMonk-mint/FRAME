const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = !!process.env.VITE_DEV_SERVER_URL

// ─── Database state ───────────────────────────────────────────────────────────

let db          = null
let dbPath      = null
let backupPath  = null
let backupsDir  = null
let dbStatus    = 'checking'   // 'checking' | 'first-run' | 'ready' | 'missing' | 'corrupt'
let dbStatusError = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthIndexToIso(index) {
  const year  = 2022 + Math.floor((index - 1) / 12)
  const month = ((index - 1) % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function isoToMonthIndex(iso) {
  const [year, month] = iso.split('-').map(Number)
  return (year - 2022) * 12 + month
}

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

// ─── Backup ───────────────────────────────────────────────────────────────────

function createSessionBackup() {
  if (!dbPath || !fs.existsSync(dbPath)) return
  try {
    fs.mkdirSync(backupsDir, { recursive: true })
    fs.copyFileSync(dbPath, backupPath)

    const stamp  = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const tsPath = path.join(backupsDir, `prism-${stamp}.db`)
    fs.copyFileSync(dbPath, tsPath)

    const existing = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('prism-') && f.endsWith('.db'))
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
    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      studio       TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'Concept',
      partner_team TEXT,
      genre        TEXT,
      release      TEXT,
      platforms    TEXT DEFAULT '[]',
      start_date   TEXT,
      end_date     TEXT,
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS picklists (
      id         TEXT NOT NULL,
      list_type  TEXT NOT NULL,
      label      TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      color      TEXT,
      PRIMARY KEY (id, list_type)
    );

    CREATE TABLE IF NOT EXISTS taxonomy_entries (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT REFERENCES taxonomy_entries(id),
      label       TEXT NOT NULL,
      level       INTEGER NOT NULL,
      color       TEXT,
      sort_order  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS maps (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id),
      stamp_year   INTEGER NOT NULL,
      stamp_month  INTEGER NOT NULL,
      start_date   TEXT NOT NULL,
      end_date     TEXT NOT NULL,
      comment      TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, stamp_year, stamp_month)
    );

    CREATE TABLE IF NOT EXISTS map_rows (
      id              TEXT PRIMARY KEY,
      map_id          TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      section_id      TEXT NOT NULL,
      taxonomy_level  INTEGER NOT NULL,
      taxonomy_key    TEXT,
      parent_row_id   TEXT REFERENCES map_rows(id),
      label           TEXT NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS row_values (
      row_id     TEXT NOT NULL REFERENCES map_rows(id) ON DELETE CASCADE,
      month_date TEXT NOT NULL,
      value      INTEGER NOT NULL,
      PRIMARY KEY (row_id, month_date)
    );

    CREATE TABLE IF NOT EXISTS map_milestones (
      id             TEXT PRIMARY KEY,
      map_id         TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      label          TEXT NOT NULL,
      type           TEXT NOT NULL,
      month_date     TEXT NOT NULL,
      note           TEXT,
      phase_boundary TEXT
    );
  `)
}

// ─── Migrations ───────────────────────────────────────────────────────────────

function runMigrations() {
  // projects table: recreate if schema drifted
  const projectCols  = db.pragma('table_info(projects)').map(c => c.name)
  const expectedCols = ['id','name','studio','status','partner_team','genre','release','platforms','start_date','end_date','notes','created_at','updated_at']
  const hasUnknownCols = projectCols.some(c => !expectedCols.includes(c))
  const missingCols    = expectedCols.filter(c => !projectCols.includes(c))

  if (hasUnknownCols || missingCols.length > 0) {
    db.exec(`
      DROP TABLE IF EXISTS projects_new;
      CREATE TABLE IF NOT EXISTS projects_new (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        studio       TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'Concept',
        partner_team TEXT,
        genre        TEXT,
        release      TEXT,
        platforms    TEXT DEFAULT '[]',
        start_date   TEXT,
        end_date     TEXT,
        notes        TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO projects_new (id, name, studio, status, partner_team, genre, release, platforms, start_date, end_date, notes, created_at, updated_at)
        SELECT
          id,
          COALESCE(name, ''),
          COALESCE(${projectCols.includes('studio') ? 'studio' : projectCols.includes('studio_id') ? 'studio_id' : "''"},''),
          COALESCE(${projectCols.includes('status') ? 'status' : "'Concept'"},'Concept'),
          ${projectCols.includes('partner_team') ? 'partner_team' : 'NULL'},
          ${projectCols.includes('genre') ? 'genre' : 'NULL'},
          ${projectCols.includes('release') ? 'release' : 'NULL'},
          COALESCE(${projectCols.includes('platforms') ? 'platforms' : "'[]'"},'[]'),
          ${projectCols.includes('start_date') ? 'start_date' : 'NULL'},
          ${projectCols.includes('end_date') ? 'end_date' : 'NULL'},
          ${projectCols.includes('notes') ? 'notes' : 'NULL'},
          COALESCE(${projectCols.includes('created_at') ? 'created_at' : "datetime('now')"},datetime('now')),
          COALESCE(${projectCols.includes('updated_at') ? 'updated_at' : "datetime('now')"},datetime('now'))
        FROM projects;
      DROP TABLE projects;
      ALTER TABLE projects_new RENAME TO projects;
    `)
    console.log('[DB] Migrated projects table to current schema')
  }

  // picklists: add missing columns
  const picklistCols = db.pragma('table_info(picklists)').map(c => c.name)
  if (!picklistCols.includes('color')) {
    db.exec('ALTER TABLE picklists ADD COLUMN color TEXT')
    console.log('[DB] Added color column to picklists')
  }
  if (!picklistCols.includes('value')) {
    db.exec('ALTER TABLE picklists ADD COLUMN value TEXT')
    console.log('[DB] Added value column to picklists')
  }

  // maps: add rate columns
  const mapCols = db.pragma('table_info(maps)').map(c => c.name)
  if (!mapCols.includes('internal_rate')) {
    db.exec('ALTER TABLE maps ADD COLUMN internal_rate REAL')
    console.log('[DB] Added internal_rate column to maps')
  }
  if (!mapCols.includes('external_rate')) {
    db.exec('ALTER TABLE maps ADD COLUMN external_rate REAL')
    console.log('[DB] Added external_rate column to maps')
  }

  // map_rows: add rate override columns
  const rowCols = db.pragma('table_info(map_rows)').map(c => c.name)
  if (!rowCols.includes('man_month_rate')) {
    db.exec('ALTER TABLE map_rows ADD COLUMN man_month_rate REAL')
    console.log('[DB] Added man_month_rate column to map_rows')
  }
  if (!rowCols.includes('budget_values')) {
    db.exec('ALTER TABLE map_rows ADD COLUMN budget_values TEXT')
    console.log('[DB] Added budget_values column to map_rows')
  }
}

// ─── Core: open, integrity-check, schema, migrate ────────────────────────────

function openAndValidateDb() {
  const Database = require('better-sqlite3')

  createSessionBackup()

  db = new Database(dbPath)

  // Integrity check before trusting the file
  const check = db.pragma('integrity_check')
  if (!Array.isArray(check) || check[0]?.integrity_check !== 'ok') {
    const detail = JSON.stringify(check)
    db.close(); db = null
    throw new Error(`integrity_check failed: ${detail}`)
  }

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runSchema()
  runMigrations()

  console.log('[DB] Opened and validated:', dbPath)
}

// ─── Init on launch ───────────────────────────────────────────────────────────

function initDatabase() {
  const config = loadConfig()

  if (!config || !config.dbPath) {
    // No config — first launch, never been set up
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
    prepareStatements()
    dbStatus = 'ready'
  } catch (err) {
    if (db) { try { db.close() } catch {} db = null }
    dbStatus = 'corrupt'
    dbStatusError = err.message
    console.error('[DB] Validation failed:', err.message)
  }
}

// ─── Prepared statements ──────────────────────────────────────────────────────

let stmts = null

function prepareStatements() {
  if (!db) return

  stmts = {
    loadProjects:   db.prepare('SELECT * FROM projects ORDER BY created_at'),
    loadMaps:       db.prepare('SELECT * FROM maps ORDER BY project_id, stamp_year, stamp_month'),
    loadRows:       db.prepare('SELECT * FROM map_rows ORDER BY map_id, sort_order'),
    loadValues:     db.prepare('SELECT * FROM row_values'),
    loadMilestones: db.prepare('SELECT * FROM map_milestones ORDER BY map_id, month_date'),

    upsertProject: db.prepare(`
      INSERT INTO projects (id, name, studio, status, partner_team, genre, release, platforms, start_date, end_date, notes)
      VALUES (@id, @name, @studio, @status, @partnerTeam, @genre, @release, @platforms, @startDate, @endDate, @notes)
      ON CONFLICT(id) DO UPDATE SET
        name         = excluded.name,
        studio       = excluded.studio,
        status       = excluded.status,
        partner_team = excluded.partner_team,
        genre        = excluded.genre,
        release      = excluded.release,
        platforms    = excluded.platforms,
        start_date   = excluded.start_date,
        end_date     = excluded.end_date,
        notes        = excluded.notes,
        updated_at   = datetime('now')
    `),

    upsertMapMeta: db.prepare(`
      INSERT INTO maps (id, project_id, stamp_year, stamp_month, start_date, end_date, comment, internal_rate, external_rate)
      VALUES (@id, @projectId, @stampYear, @stampMonth, @startDate, @endDate, @comment, @internalRate, @externalRate)
      ON CONFLICT(id) DO UPDATE SET
        stamp_year    = excluded.stamp_year,
        stamp_month   = excluded.stamp_month,
        start_date    = excluded.start_date,
        end_date      = excluded.end_date,
        comment       = excluded.comment,
        internal_rate = excluded.internal_rate,
        external_rate = excluded.external_rate
    `),

    deleteMapRows:       db.prepare('DELETE FROM map_rows WHERE map_id = ?'),
    deleteMapMilestones: db.prepare('DELETE FROM map_milestones WHERE map_id = ?'),
    deleteMap:           db.prepare('DELETE FROM maps WHERE id = ?'),
    deleteMapsByProject: db.prepare('DELETE FROM maps WHERE project_id = ?'),
    deleteProject:       db.prepare('DELETE FROM projects WHERE id = ?'),

    insertRow: db.prepare(`
      INSERT INTO map_rows (id, map_id, section_id, taxonomy_level, taxonomy_key, parent_row_id, label, sort_order, man_month_rate, budget_values)
      VALUES (@id, @mapId, @sectionId, @taxonomyLevel, @taxonomyKey, @parentRowId, @label, @sortOrder, @manMonthRate, @budgetValues)
    `),

    insertValue: db.prepare(`
      INSERT INTO row_values (row_id, month_date, value) VALUES (@rowId, @monthDate, @value)
    `),

    insertMilestone: db.prepare(`
      INSERT INTO map_milestones (id, map_id, label, type, month_date, note, phase_boundary)
      VALUES (@id, @mapId, @label, @type, @monthDate, @note, @phaseBoundary)
    `),
  }

  stmts.saveMapTransaction = db.transaction((map) => {
    stmts.upsertMapMeta.run({
      id:           map.id,
      projectId:    map.projectId,
      stampYear:    map.stampYear,
      stampMonth:   map.stampMonth,
      startDate:    map.startDate,
      endDate:      map.endDate,
      comment:      map.comment ?? null,
      internalRate: map.internalRate ?? null,
      externalRate: map.externalRate ?? null,
    })

    stmts.deleteMapRows.run(map.id)
    stmts.deleteMapMilestones.run(map.id)

    map.rows.forEach((row, i) => {
      stmts.insertRow.run({
        id:            row.id,
        mapId:         map.id,
        sectionId:     row.sectionId,
        taxonomyLevel: row.taxonomyLevel,
        taxonomyKey:   row.taxonomyKey ?? null,
        parentRowId:   row.parentRowId ?? null,
        label:         row.label,
        sortOrder:     i,
        manMonthRate:  row.manMonthRate ?? null,
        budgetValues:  row.budgetValues ? JSON.stringify(row.budgetValues) : null,
      })

      Object.entries(row.values).forEach(([monthIdx, value]) => {
        if (value === null || value === undefined) return
        stmts.insertValue.run({
          rowId:     row.id,
          monthDate: monthIndexToIso(Number(monthIdx)),
          value,
        })
      })
    })

    map.milestones.forEach((marker) => {
      stmts.insertMilestone.run({
        id:            marker.id,
        mapId:         map.id,
        label:         marker.label,
        type:          marker.type,
        monthDate:     monthIndexToIso(marker.monthIndex),
        note:          marker.note ?? null,
        phaseBoundary: marker.phaseBoundary ?? null,
      })
    })
  })
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
          title:      'Choose PRISM data folder',
          buttonLabel: 'Use this folder',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
        targetDir = result.filePaths[0]

      } else if (opts.action === 'import') {
        // Step 1: pick where to store the DB
        const folderResult = await dialog.showOpenDialog(win, {
          title:       'Choose where to store the PRISM database',
          buttonLabel: 'Use this folder',
          properties:  ['openDirectory', 'createDirectory'],
        })
        if (folderResult.canceled || !folderResult.filePaths.length) return { ok: false, cancelled: true }
        targetDir = folderResult.filePaths[0]

        // Step 2: pick the existing DB file to import from
        const fileResult = await dialog.showOpenDialog(win, {
          title:      'Select existing PRISM database',
          filters:    [{ name: 'SQLite Database', extensions: ['db'] }],
          properties: ['openFile'],
        })
        if (fileResult.canceled || !fileResult.filePaths.length) return { ok: false, cancelled: true }

        const targetDbPath = path.join(targetDir, 'frame.db')
        fs.mkdirSync(targetDir, { recursive: true })
        fs.copyFileSync(fileResult.filePaths[0], targetDbPath)
        saveConfig({ dbPath: targetDbPath })

        // Close any existing connection and open the imported file
        if (db) { try { db.close() } catch {} db = null }
        stmts = null
        setupPaths(targetDbPath)

        openAndValidateDb()
        prepareStatements()
        dbStatus = 'ready'
        dbStatusError = null
        return { ok: true, dbPath: targetDbPath }
      }

      // use-default or choose-folder: create a fresh DB
      const targetDbPath = path.join(targetDir, 'frame.db')
      fs.mkdirSync(targetDir, { recursive: true })
      saveConfig({ dbPath: targetDbPath })

      if (db) { try { db.close() } catch {} db = null }
      stmts = null
      setupPaths(targetDbPath)

      openAndValidateDb()
      prepareStatements()
      dbStatus = 'ready'
      dbStatusError = null
      return { ok: true, dbPath: targetDbPath }

    } catch (err) {
      console.error('[DB] Setup failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // Wipe the corrupt/missing DB at the current path and start fresh
  ipcMain.handle('db:wipe-and-reset', async () => {
    try {
      if (db) { try { db.close() } catch {} db = null }
      stmts = null
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

      openAndValidateDb()
      prepareStatements()
      dbStatus = 'ready'
      dbStatusError = null
      return { ok: true, dbPath }
    } catch (err) {
      console.error('[DB] Wipe-and-reset failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // Move the live database to a new folder chosen by the user
  ipcMain.handle('db:move', async (event) => {
    if (!db || !dbPath) return { ok: false, error: 'No database open' }
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win, {
        title:       'Choose new PRISM data folder',
        buttonLabel: 'Move here',
        properties:  ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }

      const newDir    = result.filePaths[0]
      const newDbPath = path.join(newDir, 'frame.db')

      if (newDbPath === dbPath) return { ok: false, error: 'That is already the current database location.' }

      // Checkpoint WAL so the copy is a complete, self-contained file
      db.pragma('wal_checkpoint(TRUNCATE)')

      // Copy to the new location
      fs.mkdirSync(newDir, { recursive: true })
      fs.copyFileSync(dbPath, newDbPath)

      // Close current connection, update globals
      db.close()
      db = null
      stmts = null
      const oldPath = dbPath
      setupPaths(newDbPath)
      saveConfig({ dbPath: newDbPath })

      // Reopen from new location
      openAndValidateDb()
      prepareStatements()
      dbStatus = 'ready'

      // Remove old file (move semantics) — best-effort, don't fail if it can't be deleted
      try { fs.unlinkSync(oldPath) } catch (e) {
        console.warn('[DB] Could not remove old database file:', e.message)
      }

      console.log('[DB] Moved to:', newDbPath)
      return { ok: true, dbPath: newDbPath, backupsDir: backupsDir }

    } catch (err) {
      console.error('[DB] Move failed:', err.message)
      // Attempt to recover: reopen the original file if it still exists
      if (!db && dbPath && fs.existsSync(dbPath)) {
        try {
          openAndValidateDb()
          prepareStatements()
          dbStatus = 'ready'
        } catch (recoverErr) {
          dbStatus = 'corrupt'
          dbStatusError = recoverErr.message
        }
      }
      return { ok: false, error: err.message }
    }
  })

  // ── Picklists ──────────────────────────────────────────────────────────────

  ipcMain.handle('db:load-picklists', () => {
    if (!db) return {}
    const rows   = db.prepare('SELECT * FROM picklists ORDER BY list_type, sort_order').all()
    const result = {}
    for (const r of rows) {
      if (!result[r.list_type]) result[r.list_type] = []
      result[r.list_type].push({ id: r.id, label: r.label, sortOrder: r.sort_order, color: r.color ?? undefined, value: r.value ?? undefined })
    }
    return result
  })

  ipcMain.handle('db:save-picklists', (event, picklists) => {
    if (!db) return { ok: false }
    db.transaction(() => {
      db.prepare('DELETE FROM picklists').run()
      const insert = db.prepare(
        'INSERT INTO picklists (id, list_type, label, sort_order, color, value) VALUES (@id, @listType, @label, @sortOrder, @color, @value)'
      )
      for (const [listType, items] of Object.entries(picklists)) {
        for (const item of items) {
          insert.run({ id: item.id, listType, label: item.label, sortOrder: item.sortOrder, color: item.color ?? null, value: item.value ?? null })
        }
      }
    })()
    return { ok: true }
  })

  // ── Taxonomy ───────────────────────────────────────────────────────────────

  ipcMain.handle('db:load-taxonomy', () => {
    if (!db) return []
    return db.prepare('SELECT * FROM taxonomy_entries ORDER BY sort_order').all().map((r) => ({
      id:        r.id,
      label:     r.label,
      color:     r.color ?? undefined,
      parentId:  r.parent_id ?? undefined,
      level:     r.level,
      sortOrder: r.sort_order,
    }))
  })

  ipcMain.handle('db:save-taxonomy', (event, entries) => {
    if (!db) return { ok: false }
    db.transaction(() => {
      db.prepare('DELETE FROM taxonomy_entries').run()
      const insert = db.prepare(`
        INSERT INTO taxonomy_entries (id, parent_id, label, level, color, sort_order)
        VALUES (@id, @parentId, @label, @level, @color, @sortOrder)
      `)
      for (const e of entries) {
        insert.run({
          id:        e.id,
          parentId:  e.parentId ?? null,
          label:     e.label,
          level:     e.level,
          color:     e.color ?? null,
          sortOrder: e.sortOrder,
        })
      }
    })()
    return { ok: true }
  })

  // ── Projects & Maps ────────────────────────────────────────────────────────

  ipcMain.handle('db:load-all', () => {
    if (!db || !stmts) return { projects: [], maps: {} }

    const projectRows   = stmts.loadProjects.all()
    const mapRows       = stmts.loadMaps.all()
    const rows          = stmts.loadRows.all()
    const values        = stmts.loadValues.all()
    const milestoneRows = stmts.loadMilestones.all()

    const valuesByRowId = {}
    for (const v of values) {
      if (!valuesByRowId[v.row_id]) valuesByRowId[v.row_id] = {}
      valuesByRowId[v.row_id][v.month_date] = v.value
    }

    const milestonesByMapId = {}
    for (const ms of milestoneRows) {
      if (!milestonesByMapId[ms.map_id]) milestonesByMapId[ms.map_id] = []
      milestonesByMapId[ms.map_id].push({
        id:            ms.id,
        label:         ms.label,
        type:          ms.type,
        monthIndex:    isoToMonthIndex(ms.month_date),
        note:          ms.note ?? undefined,
        phaseBoundary: ms.phase_boundary ?? undefined,
      })
    }

    const rowsByMapId = {}
    for (const row of rows) {
      if (!rowsByMapId[row.map_id]) rowsByMapId[row.map_id] = []

      const valuesRecord = {}
      for (let i = 1; i <= 120; i++) valuesRecord[i] = null
      const stored = valuesByRowId[row.id] ?? {}
      for (const [monthDate, value] of Object.entries(stored)) {
        valuesRecord[isoToMonthIndex(monthDate)] = value
      }

      rowsByMapId[row.map_id].push({
        id:            row.id,
        label:         row.label,
        values:        valuesRecord,
        taxonomyLevel: row.taxonomy_level,
        parentRowId:   row.parent_row_id ?? undefined,
        taxonomyKey:   row.taxonomy_key ?? undefined,
        sectionId:     row.section_id,
        manMonthRate:  row.man_month_rate ?? undefined,
        budgetValues:  row.budget_values ? JSON.parse(row.budget_values) : undefined,
      })
    }

    const mapsByProjectId = {}
    for (const map of mapRows) {
      if (!mapsByProjectId[map.project_id]) mapsByProjectId[map.project_id] = []
      mapsByProjectId[map.project_id].push({
        id:           map.id,
        projectId:    map.project_id,
        stampYear:    map.stamp_year,
        stampMonth:   map.stamp_month,
        startDate:    map.start_date,
        endDate:      map.end_date,
        comment:      map.comment ?? undefined,
        internalRate: map.internal_rate ?? undefined,
        externalRate: map.external_rate ?? undefined,
        milestones:   milestonesByMapId[map.id] ?? [],
        rows:         rowsByMapId[map.id] ?? [],
      })
    }

    const projects = projectRows.map(p => ({
      id:               p.id,
      name:             p.name,
      studio:           p.studio ?? '',
      status:           p.status ?? 'Concept',
      partnerTeam:      p.partner_team ?? '',
      genres:           (() => { try { const v = JSON.parse(p.genre ?? '[]'); return Array.isArray(v) ? v : [v].filter(Boolean) } catch { return p.genre ? [p.genre] : [] } })(),
      platforms:        JSON.parse(p.platforms ?? '[]'),
      projectStartDate: p.start_date ?? '',
      projectEndDate:   p.end_date ?? '',
      notes:            p.notes ?? '',
    }))

    return { projects, maps: mapsByProjectId }
  })

  ipcMain.handle('db:save-project', (event, project) => {
    if (!db || !stmts) return { ok: false }
    const str  = (v) => (v == null ? null : String(v))
    const platforms = Array.isArray(project.platforms)
      ? JSON.stringify(project.platforms)
      : (typeof project.platforms === 'string' ? project.platforms : '[]')
    stmts.upsertProject.run({
      id:          str(project.id),
      name:        str(project.name) ?? '',
      studio:      str(project.studio) ?? '',
      status:      str(project.status) ?? 'Concept',
      partnerTeam: str(project.partnerTeam),
      genre:       JSON.stringify(Array.isArray(project.genres) ? project.genres : []),
      release:     '',
      platforms,
      startDate:   str(project.projectStartDate),
      endDate:     str(project.projectEndDate),
      notes:       str(project.notes),
    })
    return { ok: true }
  })

  ipcMain.handle('db:save-map', (event, map) => {
    if (!db || !stmts) return { ok: false }
    stmts.saveMapTransaction(map)
    return { ok: true }
  })

  ipcMain.handle('db:delete-map', (event, mapId) => {
    if (!db || !stmts) return { ok: false }
    stmts.deleteMap.run(mapId)
    return { ok: true }
  })

  ipcMain.handle('db:delete-project', (event, projectId) => {
    if (!db || !stmts) return { ok: false }
    stmts.deleteMapsByProject.run(projectId)
    stmts.deleteProject.run(projectId)
    return { ok: true }
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
        .filter(f => f.startsWith('prism-') && f.endsWith('.db'))
        .sort()
        .reverse()
        .map(filename => {
          const fullPath = path.join(backupsDir, filename)
          const stat     = fs.statSync(fullPath)
          const datePart = filename.replace('prism-', '').replace('.db', '')
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
        title:       'Export PRISM Database',
        defaultPath: `prism-export-${new Date().toISOString().slice(0, 10)}.db`,
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
        title:      'Import PRISM Database',
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
    const allowed = ['https://github.com/WoodyMonk-mint/PRISM/']
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
    backgroundColor: '#0f1117',
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

