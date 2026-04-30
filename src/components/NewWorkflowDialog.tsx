import { useEffect, useRef, useState } from 'react'
import type { WorkflowTemplate } from '../types'
import { todayIso } from '../lib/date'
import { TagInput } from './TagInput'

type Props = {
  templates:      WorkflowTemplate[]
  tagSuggestions: string[]
  onCancel:       () => void
  onSubmit:       (input: {
    templateId:       number
    name:             string
    gateType:         string | null
    projectRef:       string | null
    startDate:        string | null
    targetDate:       string | null
    tags:             string[]
    applyTagsToSteps: boolean
  }) => Promise<void>
}

const GATE_TYPES = ['Concept', 'VS', 'EFP', 'FP'] as const

export function NewWorkflowDialog({ templates, tagSuggestions, onCancel, onSubmit }: Props) {
  const [templateId, setTemplateId] = useState<number | null>(templates[0]?.id ?? null)
  const [name, setName]             = useState('')
  const [gateType, setGateType]     = useState<string | null>(null)
  const [projectRef, setProjectRef] = useState('')
  const [startDate, setStartDate]   = useState(todayIso())
  const [targetDate, setTargetDate] = useState('')
  const [tags, setTags]                       = useState<string[]>([])
  const [applyTagsToSteps, setApplyTagsToSteps] = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const tpl = templates.find(t => t.id === templateId) ?? null
  const isGateReview = (tpl?.name ?? '').toLowerCase().includes('gate review')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (templateId == null) { setError('Pick a template.'); return }
    if (!name.trim())       { setError('Name is required.'); return }
    if (isGateReview && !gateType) { setError('Pick a gate type.'); return }
    setSaving(true)
    try {
      await onSubmit({
        templateId,
        name:             name.trim(),
        gateType:         isGateReview ? gateType : null,
        projectRef:       projectRef.trim() || null,
        startDate:        startDate || null,
        targetDate:       targetDate || null,
        tags,
        applyTagsToSteps,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card task-modal" onClick={e => e.stopPropagation()}>
        <p className="panel-label">New workflow</p>
        <h3>Start a workflow</h3>

        {error && <div className="setup-error">{error}</div>}

        <form onSubmit={submit} className="task-form">
          <label className="form-field">
            <span>Template</span>
            <select
              value={templateId ?? ''}
              onChange={e => setTemplateId(e.target.value ? Number(e.target.value) : null)}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.stepCount} step{t.stepCount === 1 ? '' : 's'})</option>
              ))}
            </select>
          </label>

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

          {isGateReview && (
            <label className="form-field">
              <span>Gate type</span>
              <select value={gateType ?? ''} onChange={e => setGateType(e.target.value || null)}>
                <option value="">— Select —</option>
                {GATE_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          )}

          <label className="form-field">
            <span>Project reference <em className="muted compact">(optional)</em></span>
            <input
              type="text"
              value={projectRef}
              onChange={e => setProjectRef(e.target.value)}
              placeholder="Project name or code"
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min="2020-01-01" />
            </label>
            <label className="form-field">
              <span>Target date <em className="muted compact">(optional)</em></span>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} min="2020-01-01" />
            </label>
          </div>

          <div className="form-field">
            <span>Tags <em className="muted compact">(optional)</em></span>
            <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>

          {tags.length > 0 && (
            <label className="inherit-tickbox">
              <input
                type="checkbox"
                checked={applyTagsToSteps}
                onChange={e => setApplyTagsToSteps(e.target.checked)}
              />
              <span>Apply these tags to every step task</span>
            </label>
          )}

          {tpl && (
            <p className="muted compact" style={{ fontSize: '0.75rem' }}>
              Will create {tpl.stepCount} step task{tpl.stepCount === 1 ? '' : 's'} from <strong>{tpl.name}</strong>.
              {startDate && ' Each step\'s due date is the start date plus its template offset (where set).'}
            </p>
          )}

          <div className="dialog-actions">
            <button type="button" className="chip" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving || templateId == null}>
              {saving ? 'Creating…' : 'Create workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
