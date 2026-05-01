import { useEffect, useRef, useState } from 'react'
import type {
  Assignee, Priority, Status, WorkflowInstance, WorkflowTemplate,
} from '../types'
import { ALL_PRIORITIES, ALL_STATUSES } from '../types'
import { todayIso } from '../lib/date'
import { TagInput } from './TagInput'

const GATE_TYPES = ['Concept', 'VS', 'EFP', 'FP'] as const

const STATUS_LABEL: Record<Status, string> = {
  PLANNING:  'Planning',
  WIP:       'In progress',
  BLOCKED:   'Blocked',
  ON_HOLD:   'On hold',
  DONE:      'Done',
  CANCELLED: 'Cancelled',
}

type CreateProps = {
  mode:           'create'
  templates:      WorkflowTemplate[]
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSubmit:       (input: {
    templateId:       number
    name:             string
    gateType:         string | null
    projectRef:       string | null
    startDate:        string | null
    targetDate:       string | null
    priority:         Priority | null
    primaryOwner:     string | null
    assignees:        string[]
    tags:             string[]
    applyTagsToSteps: boolean
  }) => Promise<void>
}

type EditProps = {
  mode:           'edit'
  instance:       WorkflowInstance
  assignees:      Assignee[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSubmit:       (patch: {
    name:         string
    gateType:     string | null
    projectRef:   string | null
    startDate:    string | null
    targetDate:   string | null
    status:       Status
    priority:     Priority | null
    primaryOwner: string | null
    assignees:    string[]
    tags:         string[]
  }) => Promise<void>
}

type Props = CreateProps | EditProps

export function WorkflowDialog(props: Props) {
  const isEdit = props.mode === 'edit'
  const initialInstance = isEdit ? props.instance : null

  const [templateId, setTemplateId] = useState<number | null>(
    isEdit
      ? (initialInstance?.templateId ?? null)
      : ((props as CreateProps).templates[0]?.id ?? null)
  )
  const [name, setName]             = useState(initialInstance?.name ?? '')
  const [gateType, setGateType]     = useState<string | null>(initialInstance?.gateType ?? null)
  const [projectRef, setProjectRef] = useState(initialInstance?.projectRef ?? '')
  const [startDate, setStartDate]   = useState(initialInstance?.startDate ?? (isEdit ? '' : todayIso()))
  const [targetDate, setTargetDate] = useState(initialInstance?.targetDate ?? '')
  const [status, setStatus]         = useState<Status>((initialInstance?.status as Status) ?? 'WIP')
  const [priority, setPriority]     = useState<Priority | null>(initialInstance?.priority ?? null)
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(initialInstance?.primaryOwner ?? null)
  const [team, setTeam]             = useState<string[]>(() => {
    const existing = initialInstance?.assignees ?? []
    const owner    = initialInstance?.primaryOwner
    if (owner && !existing.includes(owner)) return [...existing, owner]
    return existing
  })
  const [tags, setTags]             = useState<string[]>(initialInstance?.tags ?? [])
  const [applyTagsToSteps, setApplyTagsToSteps] = useState(true)

  const [error, setError]           = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  // Auto-add the primary owner to the team when it changes.
  useEffect(() => {
    if (primaryOwner) {
      setTeam(t => t.includes(primaryOwner) ? t : [...t, primaryOwner])
    }
  }, [primaryOwner])

  const tpl = isEdit
    ? null
    : (props as CreateProps).templates.find(t => t.id === templateId) ?? null
  const isGateReview = isEdit
    ? (initialInstance?.templateName ?? '').toLowerCase().includes('gate review')
    : (tpl?.name ?? '').toLowerCase().includes('gate review')

  const toggleTeam = (n: string) => {
    setTeam(t => t.includes(n) ? t.filter(x => x !== n) : [...t, n])
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isEdit && templateId == null) { setError('Pick a template.'); return }
    if (!name.trim())                   { setError('Name is required.'); return }
    if (isGateReview && !gateType)      { setError('Pick a gate type.'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await props.onSubmit({
          name:         name.trim(),
          gateType:     isGateReview ? gateType : null,
          projectRef:   projectRef.trim() || null,
          startDate:    startDate || null,
          targetDate:   targetDate || null,
          status,
          priority,
          primaryOwner,
          assignees:    team,
          tags,
        })
      } else {
        await (props as CreateProps).onSubmit({
          templateId:       templateId as number,
          name:             name.trim(),
          gateType:         isGateReview ? gateType : null,
          projectRef:       projectRef.trim() || null,
          startDate:        startDate || null,
          targetDate:       targetDate || null,
          priority,
          primaryOwner,
          assignees:        team,
          tags,
          applyTagsToSteps,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card task-modal">
        <p className="panel-label">{isEdit ? 'Edit workflow' : 'New workflow'}</p>
        <h3>{isEdit ? (initialInstance?.name ?? 'Edit workflow') : 'Start a workflow'}</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          {!isEdit && (
            <label className="form-field">
              <span>Template</span>
              <select
                value={templateId ?? ''}
                onChange={e => setTemplateId(e.target.value ? Number(e.target.value) : null)}
              >
                {(props as CreateProps).templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.stepCount} step{t.stepCount === 1 ? '' : 's'})</option>
                ))}
              </select>
            </label>
          )}
          {isEdit && (
            <label className="form-field">
              <span>Template</span>
              <input type="text" value={initialInstance?.templateName ?? '—'} disabled />
            </label>
          )}

          <label className="form-field">
            <span>Name</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isGateReview ? 'e.g. "070 VS Gate Review"' : 'Short name for this run'}
              required
            />
          </label>

          <div className="form-row">
            {isGateReview && (
              <label className="form-field">
                <span>Gate type</span>
                <select value={gateType ?? ''} onChange={e => setGateType(e.target.value || null)}>
                  <option value="">— Select —</option>
                  {GATE_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            {isEdit && (
              <label className="form-field">
                <span>Status</span>
                <select value={status} onChange={e => setStatus(e.target.value as Status)}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Priority</span>
              <select value={priority ?? ''} onChange={e => setPriority(e.target.value ? e.target.value as Priority : null)}>
                <option value="">— None —</option>
                {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>Primary owner</span>
              <select value={primaryOwner ?? ''} onChange={e => setPrimaryOwner(e.target.value || null)}>
                <option value="">— Unassigned —</option>
                {props.assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Project reference <em className="muted compact">(optional)</em></span>
              <input
                type="text"
                value={projectRef}
                onChange={e => setProjectRef(e.target.value)}
                placeholder="Project name or code"
              />
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min="2020-01-01" />
            </label>
            <label className="form-field">
              <span>Target date <em className="muted compact">(due)</em></span>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} min="2020-01-01" />
            </label>
          </div>

          <div className="form-field">
            <span>Team</span>
            <div className="chip-row">
              {props.assignees.map(a => (
                <button
                  type="button"
                  key={a.id}
                  className={`chip ${team.includes(a.name) ? 'active' : ''}`}
                  onClick={() => toggleTeam(a.name)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <span>Tags <em className="muted compact">(optional)</em></span>
            <TagInput value={tags} onChange={setTags} suggestions={props.tagSuggestions} />
          </div>

          {!isEdit && tags.length > 0 && (
            <label className="inherit-tickbox">
              <input
                type="checkbox"
                checked={applyTagsToSteps}
                onChange={e => setApplyTagsToSteps(e.target.checked)}
              />
              <span>Apply these tags to every step task</span>
            </label>
          )}
          {isEdit && (
            <p className="muted compact" style={{ fontSize: '0.75rem' }}>
              Tag changes here apply only to the workflow itself. Step-task tags stay independent.
            </p>
          )}

          {!isEdit && tpl && (
            <p className="muted compact" style={{ fontSize: '0.75rem' }}>
              Will create {tpl.stepCount} step task{tpl.stepCount === 1 ? '' : 's'} from <strong>{tpl.name}</strong>.
              {startDate && ' Each step\'s due date is the start date plus its template offset (where set).'}
            </p>
          )}

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={props.onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving || (!isEdit && templateId == null)}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create workflow')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
