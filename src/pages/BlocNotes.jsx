import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { StickyNote, Plus, Trash2, Pencil, X, Check } from 'lucide-react'

export default function BlocNotes() {
  const { notes, addNote, updateNote, removeNote } = useApp()
  // Les consignes transmises ([C]) ne sont pas des notes : elles restent visibles
  // dans le Tableau de bord et les panneaux Consignes, mais pas ici.
  const visibleNotes = useMemo(
    () => notes.filter((n) => !String(n.title || '').startsWith('[C] ')),
    [notes]
  )
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const startCreate = () => {
    setCreating(true)
    setNewTitle('')
    setNewContent('')
  }

  const saveCreate = () => {
    if (!newTitle.trim() && !newContent.trim()) {
      setCreating(false)
      return
    }
    addNote(newTitle.trim() || 'Note', newContent.trim())
    setCreating(false)
  }

  const startEdit = (note) => {
    setEditingId(note.id)
    setEditTitle(note.title)
    setEditContent(note.content)
  }

  const saveEdit = () => {
    if (editingId) {
      updateNote(editingId, {
        title: editTitle.trim() || 'Note',
        content: editContent.trim(),
      })
    }
    setEditingId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Bloc-notes</h1>
          <p className="text-slate-600 mt-1">{visibleNotes.length} note(s) — conservées même après réinitialisation</p>
        </div>
        {!creating && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-md hover:bg-amber-600 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Nouvelle note
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-amber-800">Nouvelle note</h2>
            <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titre de la note"
            className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm font-medium bg-white mb-2"
            autoFocus
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Contenu..."
            rows={4}
            className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm bg-white resize-y"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
              Annuler
            </button>
            <button onClick={saveCreate} className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-md hover:bg-amber-600 text-sm font-semibold">
              <Check className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </div>
      )}

      {visibleNotes.length === 0 && !creating && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <StickyNote className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          Aucune note. Cliquez sur « Nouvelle note » pour commencer.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleNotes.map((note) => (
          <div key={note.id} className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4 flex flex-col">
            {editingId === note.id ? (
              <>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Titre"
                  className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm font-medium bg-white mb-2"
                  autoFocus
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Contenu..."
                  rows={5}
                  className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm bg-white resize-y mb-3"
                />
                <div className="flex gap-2 mt-auto">
                  <button onClick={saveEdit} className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-md hover:bg-amber-600 text-sm font-semibold">
                    <Check className="h-4 w-4" /> OK
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-800">{note.title}</h3>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(note)} className="text-slate-400 hover:text-sky-600 p-1" title="Modifier">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Supprimer cette note ?')) removeNote(note.id)
                      }}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">{note.content}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}