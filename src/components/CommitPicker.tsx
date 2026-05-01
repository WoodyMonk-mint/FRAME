import type { PlanningPeriod } from '../types'

type Props = {
  periods:  PlanningPeriod[]
  selected: number[]
  onToggle: (id: number) => void
}

// Multi-select picker for planning-period commitments. Used by TaskModal
// and WorkflowDialog. Lives outside the form-field flex stack so the
// uppercase muted label styling on form-field's first span doesn't apply.
export function CommitPicker({ periods, selected, onToggle }: Props) {
  return (
    <section className="commit-picker-section">
      <p className="panel-label commit-picker-heading">Committed to</p>
      <div className="commit-picker">
        {periods.map(p => {
          const checked = selected.includes(p.id)
          return (
            <label key={p.id} className="commit-picker-row">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(p.id)}
              />
              <span className="commit-picker-kind">{p.kind}</span>
              <span className="commit-picker-name">{p.name}</span>
              <span className="commit-picker-dates muted compact">
                {p.startDate} → {p.endDate}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
