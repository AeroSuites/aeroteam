import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Smile,
} from 'lucide-react'

const FONTS = ['Arial', 'Verdana', 'Tahoma', 'Times New Roman', 'Courier New']
const COLORS = [
  '#0f172a',
  '#dc2626',
  '#ea580c',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  '#64748b',
]

export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'span',
  'font',
  'ul',
  'ol',
  'li',
  'div',
  'blockquote',
  'a',
]
export const ALLOWED_ATTR = ['style', 'href', 'target', 'rel', 'size', 'color', 'face']

const EMOJIS = [
  '👍', '✅', '❌', '⚠️', '🚨', '🔧', '🔩', '✈️', '🛠️', '📎',
  '📅', '⏰', '👌', '🙏', '😊', '😉', '😂', '😅', '😮', '🙌',
  '🔴', '🟠', '🟢', '🔵', '⭐', '❗', '❓', '💪', '🧰', '📞',
]

export default function RichEditor({
  onChange,
  placeholder = '',
  minHeight = 80,
  value,
  onEnterSend,
}) {
  const ref = useRef(null)
  const valueRef = useRef('')
  const [showEmoji, setShowEmoji] = useState(false)

  const sync = () => {
    if (!ref.current) return
    const raw = ref.current.innerHTML
    const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR })
    if (clean !== ref.current.innerHTML) ref.current.innerHTML = clean
    valueRef.current = clean
    const div = document.createElement('div')
    div.innerHTML = clean
    onChange(clean, (div.textContent || '').trim())
  }

  // Synchronise le contenu affiché : interne (frappe) ou externe (prop value)
  useEffect(() => {
    if (value !== undefined && value !== valueRef.current) {
      valueRef.current = value || ''
    }
    if (ref.current && ref.current.innerHTML !== valueRef.current) {
      ref.current.innerHTML = valueRef.current
    }
  })

  const exec = (command, arg) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    sync()
  }

  const toolbarButton =
    'p-1.5 rounded hover:bg-slate-200 text-slate-600 transition-colors'

  return (
    <div className="border border-slate-300 rounded-md focus-within:border-sky-400 overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <button type="button" className={toolbarButton} title="Gras" onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Italique" onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Souligné" onClick={() => exec('underline')}>
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Barré" onClick={() => exec('strikeThrough')}>
          <Strikethrough className="h-4 w-4" />
        </button>
        <span className="w-px h-5 bg-slate-300 mx-0.5" />
        <button type="button" className={toolbarButton} title="Liste à puces" onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Liste numérotée" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="w-px h-5 bg-slate-300 mx-0.5" />
        <button type="button" className={toolbarButton} title="Aligner à gauche" onClick={() => exec('justifyLeft')}>
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Centrer" onClick={() => exec('justifyCenter')}>
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButton} title="Aligner à droite" onClick={() => exec('justifyRight')}>
          <AlignRight className="h-4 w-4" />
        </button>
        <span className="w-px h-5 bg-slate-300 mx-0.5" />
        <select
          title="Police"
          className="text-xs border border-slate-300 rounded px-1 py-1 bg-white"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec('fontName', e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">Police…</option>
          {FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <div className="flex items-center gap-1" title="Couleur du texte">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="h-5 w-5 rounded-full border border-slate-300 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              onClick={() => exec('foreColor', c)}
              title={c}
            />
          ))}
        </div>
        <span className="w-px h-5 bg-slate-300 mx-0.5" />
        <div className="relative">
          <button
            type="button"
            className={toolbarButton}
            title="Emojis"
            onClick={() => setShowEmoji((v) => !v)}
          >
            <Smile className="h-4 w-4" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full mb-1 left-0 z-40 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-56">
              <div className="flex flex-wrap gap-0.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      exec('insertText', e)
                      setShowEmoji(false)
                    }}
                    className="h-7 w-7 rounded hover:bg-slate-100 text-base leading-none"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onKeyDown={(e) => {
          if (onEnterSend && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sync()
            onEnterSend()
          }
        }}
        data-placeholder={placeholder}
        className="p-2 text-sm text-slate-800 outline-none editor-body"
        style={{ minHeight }}
      />
    </div>
  )
}