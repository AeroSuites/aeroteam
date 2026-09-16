import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'

// Fonction note uniforme : pastille ambre cliquable, éditeur en ligne,
// utilisée à l'identique dans Tâches, Affectation et Préparation.
export default function NoteCell({ note, onSave, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  const start = () => {
    setText(note || '')
    setEditing(true)
  }

  const save = () => {
    onSave(text.trim() || undefined)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="Note…"
          className="border border-amber-300 rounded-md px-2 py-1 text-xs w-44"
        />
        <button
          onClick={save}
          className="text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded p-1"
          title="Enregistrer la note"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-slate-400 hover:text-slate-700 p-1"
          title="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }

  if (note) {
    return (
      <button
        onClick={start}
        className={`inline-flex items-center gap-1 max-w-[180px] shrink-0 text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
        title={`${note} — cliquer pour modifier`}
      >
        <Pencil className="h-3 w-3 shrink-0" />
        <span className="truncate">{note}</span>
      </button>
    )
  }

  return (
    <button
      onClick={start}
      className={`inline-flex items-center gap-1 shrink-0 text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
      title="Ajouter une note"
    >
      <Pencil className="h-3 w-3" />
      Ajouter une note
    </button>
  )
}
