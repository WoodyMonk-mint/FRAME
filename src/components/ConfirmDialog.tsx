type Props = {
  label?:        string
  title:         string
  body:          string
  confirmLabel?: string
  cancelLabel?:  string
  danger?:       boolean
  onCancel:      () => void
  onConfirm:     () => void
}

export function ConfirmDialog({
  label    = 'Confirm',
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog-card">
        <p className="panel-label">{label}</p>
        <h3>{title}</h3>
        <p className="muted compact">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="chip" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'chip chip--danger' : 'primary-button'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
