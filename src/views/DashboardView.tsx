import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type {
  Assignee, Category, OverdueTrendPoint, Status, Task, WorkflowInstance,
} from '../types'
import type { QuickFilterPreset } from '../lib/taskFilters'
import { ALL_STATUSES } from '../types'
import { isOverdue, todayIso } from '../lib/date'

const STATUS_LABEL: Record<Status, string> = {
  PLANNING: 'Planning', WIP: 'In progress', BLOCKED: 'Blocked',
  ON_HOLD: 'On hold', DONE: 'Done', CANCELLED: 'Cancelled',
}

const STATUS_COLOUR: Record<Status, string> = {
  PLANNING:  '#94a3b8',
  WIP:       '#6366f1',
  BLOCKED:   '#ef4444',
  ON_HOLD:   '#f59e0b',
  DONE:      '#22c55e',
  CANCELLED: '#64748b',
}

function isCountable(t: Task): boolean {
  // Excludes workflow synthetic relationships (steps), recurrence templates,
  // and deleted rows. We count actual user-facing tasks.
  if (t.workflowInstanceId !== null) return false
  if (t.recurrenceUnit !== null && t.recurrenceTemplateId === null) return false
  return true
}

function isOpen(t: Task): boolean {
  return t.status !== 'DONE' && t.status !== 'CANCELLED'
}

type Props = {
  onJumpToTasks?: (preset: QuickFilterPreset) => void
}

export function DashboardView({ onJumpToTasks }: Props = {}) {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [workflows, setWorkflows]   = useState<WorkflowInstance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees]   = useState<Assignee[]>([])
  const [trend, setTrend]           = useState<OverdueTrendPoint[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [takingSnapshot, setTakingSnapshot] = useState(false)
  const [snapshotMsg, setSnapshotMsg]       = useState<string | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [t, w, c, a, tr] = await Promise.all([
        window.frame.db.listTasks(),
        window.frame.db.listWorkflowInstances(),
        window.frame.db.listCategories(),
        window.frame.db.listAssignees(),
        window.frame.db.listOverdueTrend(6),
      ])
      setTasks(t)
      setWorkflows(w)
      setCategories(c)
      setAssignees(a)
      setTrend(tr)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const onTakeSnapshot = async () => {
    setTakingSnapshot(true)
    setSnapshotMsg(null)
    try {
      const r = await window.frame.db.takeSnapshot()
      if (!r.ok) {
        setError(r.error ?? 'Snapshot failed')
      } else {
        setSnapshotMsg(`Snapshot saved (${r.taskCount ?? 0} task${r.taskCount === 1 ? '' : 's'} · ${r.snapshotDate})`)
        await reload()
      }
    } finally {
      setTakingSnapshot(false)
    }
  }

  // ─── Summary stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const open: Task[] = []
    const overdue: Task[] = []
    const dueThisWeek: Task[] = []
    const blocked: Task[] = []

    const today = todayIso()
    const weekEnd = new Date(today + 'T00:00:00Z')
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
    const weekEndIso = weekEnd.toISOString().slice(0, 10)

    for (const t of tasks) {
      if (!isCountable(t)) continue
      if (!isOpen(t)) continue
      open.push(t)
      if (isOverdue(t.dueDate, t.status))           overdue.push(t)
      else if (t.dueDate && t.dueDate >= today && t.dueDate <= weekEndIso) dueThisWeek.push(t)
      if (t.status === 'BLOCKED')                   blocked.push(t)
    }
    return { open, overdue, dueThisWeek, blocked }
  }, [tasks])

  // ─── Chart data ──────────────────────────────────────────────────────────

  const statusData = useMemo(() => {
    const counts: Record<Status, number> = {
      PLANNING: 0, WIP: 0, BLOCKED: 0, ON_HOLD: 0, DONE: 0, CANCELLED: 0,
    }
    for (const t of tasks) {
      if (!isCountable(t)) continue
      counts[t.status] = (counts[t.status] ?? 0) + 1
    }
    return ALL_STATUSES
      .map(s => ({ status: s, label: STATUS_LABEL[s], value: counts[s], colour: STATUS_COLOUR[s] }))
      .filter(d => d.value > 0)
  }, [tasks])

  const categoryData = useMemo(() => {
    const counts = new Map<number | null, number>()
    for (const t of tasks) {
      if (!isCountable(t)) continue
      if (!isOpen(t)) continue
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    }
    return categories
      .filter(c => !c.isArchived)
      .map(c => ({ name: c.name, value: counts.get(c.id) ?? 0, colour: c.colour ?? '#9d9da6' }))
      .filter(d => d.value > 0)
      .concat(
        counts.has(null) ? [{ name: '(No category)', value: counts.get(null) ?? 0, colour: '#9d9da6' }] : []
      )
  }, [tasks, categories])

  const workloadData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (!isCountable(t)) continue
      if (!isOpen(t)) continue
      const key = t.primaryOwner ?? '(Unassigned)'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const ordered: Array<{ name: string; value: number }> = []
    for (const a of assignees) {
      ordered.push({ name: a.name, value: counts.get(a.name) ?? 0 })
    }
    if (counts.has('(Unassigned)')) {
      ordered.push({ name: '(Unassigned)', value: counts.get('(Unassigned)') ?? 0 })
    }
    return ordered.filter(d => d.value > 0)
  }, [tasks, assignees])

  const workflowData = useMemo(() => {
    return workflows
      .filter(w => w.status !== 'DONE' && w.status !== 'CANCELLED')
      .map(w => ({
        name: w.name,
        done: w.doneSteps,
        remaining: Math.max(0, w.totalSteps - w.doneSteps),
      }))
  }, [workflows])

  if (loading) {
    return <div className="view-empty"><p className="muted">Loading…</p></div>
  }

  return (
    <div className="task-view">
      <header className="view-header view-header-row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted compact">
            {stats.open.length} open task{stats.open.length === 1 ? '' : 's'}
            {' · '}
            updated {todayIso()}
            {snapshotMsg && <> · <span className="muted compact">{snapshotMsg}</span></>}
          </p>
        </div>
        <div className="header-actions">
          <button className="chip" onClick={onTakeSnapshot} disabled={takingSnapshot}>
            {takingSnapshot ? 'Snapshotting…' : 'Take snapshot now'}
          </button>
        </div>
      </header>

      {error && <div className="setup-error" style={{ margin: '1rem 2rem 0' }}>{error}</div>}

      <div className="dashboard-grid">
        <div className="dashboard-card-row">
          <SummaryCard label="Total open"    value={stats.open.length}        onClick={onJumpToTasks ? () => onJumpToTasks('all-open')  : undefined} />
          <SummaryCard label="Overdue"       value={stats.overdue.length}     accent="danger" onClick={onJumpToTasks ? () => onJumpToTasks('overdue')   : undefined} />
          <SummaryCard label="Due this week" value={stats.dueThisWeek.length} accent="warn"   onClick={onJumpToTasks ? () => onJumpToTasks('this-week') : undefined} />
          <SummaryCard label="Blocked"       value={stats.blocked.length}     accent="danger" onClick={onJumpToTasks ? () => onJumpToTasks('blocked')   : undefined} />
        </div>

        <div className="dashboard-charts">
          <ChartCard title="Tasks by status">
            {statusData.length === 0 ? (
              <p className="muted compact">No tasks.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {statusData.map((d) => (
                      <Cell key={d.status} fill={d.colour} stroke="rgba(0,0,0,0)" />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Open tasks by category">
            {categoryData.length === 0 ? (
              <p className="muted compact">No open tasks.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={64} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {categoryData.map((d, i) => (
                      <Cell key={i} fill={d.colour} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Workload (open tasks per primary owner)">
            {workloadData.length === 0 ? (
              <p className="muted compact">No assigned open tasks.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(140, workloadData.length * 28 + 40)}>
                <BarChart data={workloadData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={84} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Overdue count over time">
            {trend.length === 0 ? (
              <p className="muted compact">
                No snapshots yet. Click "Take snapshot now" to record today's state.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="overdueCount" name="Overdue" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="openCount"    name="Open"    stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Active workflows — progress">
            {workflowData.length === 0 ? (
              <p className="muted compact">No active workflows.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(140, workflowData.length * 28 + 40)}>
                <BarChart data={workflowData} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <XAxis type="number" tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} domain={[0, 1]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip formatter={(v, n) => [v as number, n === 'done' ? 'Done' : 'Remaining']} />
                  <Bar dataKey="done"      stackId="a" fill="#22c55e" />
                  <Bar dataKey="remaining" stackId="a" fill="rgba(99, 102, 241, 0.35)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, accent, onClick,
}: {
  label:    string
  value:    number
  accent?:  'danger' | 'warn'
  onClick?: () => void
}) {
  const className = [
    'dashboard-card',
    accent ? `dashboard-card-${accent}` : '',
    onClick ? 'dashboard-card-clickable' : '',
  ].filter(Boolean).join(' ')
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <div className="dashboard-card-value">{value}</div>
        <div className="dashboard-card-label">{label}</div>
      </button>
    )
  }
  return (
    <div className={className}>
      <div className="dashboard-card-value">{value}</div>
      <div className="dashboard-card-label">{label}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dashboard-chart-card">
      <h2 className="dashboard-chart-title">{title}</h2>
      {children}
    </section>
  )
}
