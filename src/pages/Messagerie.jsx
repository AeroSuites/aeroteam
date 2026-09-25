import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Send,
  Paperclip,
  Download,
  Trash2,
  MessageSquare,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'

const MAX_ATTACHMENT = 5 * 1024 * 1024 // 5 Mo (comme côté serveur)

const frTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const frDay = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  if (same) return "Aujourd'hui"
  const hier = new Date(today)
  hier.setDate(hier.getDate() - 1)
  if (d.toDateString() === hier.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const initials = (name) =>
  String(name || '?')
    .split(/[\s()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const humanSize = (n) => {
  const v = Number(n || 0)
  if (v < 1024) return `${v} o`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} Ko`
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`
}

// Mise en forme des messages : pastilles (- ou •), gras (*...*) et italique (_..._)
const INLINE_RE = /(\*[^*\n]+\*|_[^_\n]+_)/g

function Inline({ text }) {
  const parts = String(text || '').split(INLINE_RE)
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}

function RichText({ text }) {
  const lines = String(text || '').split('\n')
  return lines.map((line, i) => {
    const m = line.match(/^\s*[-•]\s+(.*)$/)
    if (m) {
      return (
        <span key={i} className="flex items-start gap-1.5">
          <span className="text-sky-500 font-bold leading-5 shrink-0">•</span>
          <span className="flex-1">
            <Inline text={m[1]} />
          </span>
        </span>
      )
    }
    if (!line) return <br key={i} />
    return (
      <span key={i} className="block">
        <Inline text={line} />
      </span>
    )
  })
}

// Aperçu court dans la liste (sans les marqueurs de mise en forme)
const previewText = (text) =>
  String(text || '')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

const EMOJIS = [
  '👍', '✅', '❌', '⚠️', '🚨', '🔧', '🔩', '✈️', '🛠️', '📎',
  '📅', '⏰', '👌', '🙏', '😊', '😉', '😂', '😅', '😮', '🙌',
  '🔴', '🟠', '🟢', '🔵', '⭐', '❗', '❓', '💪', '🧰', '📞',
]


export default function Messagerie() {
  const { activeProfile } = useApp()
  const code = activeProfile?.code

  const [contacts, setContacts] = useState([])
  const [threads, setThreads] = useState([])
  const [contactId, setContactId] = useState(null)
  const [messages, setMessages] = useState(null)
  const [search, setSearch] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)

  const fileRef = useRef(null)
  const textRef = useRef(null)
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadLists = async () => {
    if (!code) return
    try {
      const [c, t] = await Promise.all([
        profileStore.msgContacts(code),
        profileStore.msgThreads(code),
      ])
      if (c?.ok) setContacts(c.contacts || [])
      if (t?.ok) setThreads(t.threads || [])
      window.dispatchEvent(new Event('messages-updated'))
    } catch {
      // hors ligne : on garde l'affichage courant
    }
  }

  const loadThread = async (id) => {
    if (!code || !id) return
    try {
      const res = await profileStore.msgThread(code, id)
      if (res?.ok) setMessages(res.messages || [])
      else setMessages([])
      window.dispatchEvent(new Event('messages-updated'))
    } catch {
      setError('Impossible de charger la conversation (hors ligne ?).')
    }
  }

  useEffect(() => {
    loadLists()
    const timer = setInterval(() => {
      loadLists()
    }, 30000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Aucun profil sélectionné par défaut : le choix reste à l'utilisateur
  // (évite les envois au mauvais destinataire).

  // Rafraîchit le fil ouvert régulièrement (nouveaux messages)
  useEffect(() => {
    if (!contactId) return
    loadThread(contactId)
    pollRef.current = setInterval(() => loadThread(contactId), 20000)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const contact = useMemo(
    () => contacts.find((c) => c.id === contactId) || null,
    [contacts, contactId]
  )

  // Liste affichée : conversations (dernier message) puis contacts sans conversation
  const listItems = useMemo(() => {
    const byId = {}
    const items = []
    threads.forEach((t) => {
      byId[t.contact_id] = true
      items.push({
        id: t.contact_id,
        name: t.contact_name,
                        preview: t.last_attachment
          ? `📎 ${t.last_attachment}`
          : previewText(t.last_body),
        at: t.last_at,
        unread: Number(t.unread || 0),
      })
    })
    contacts.forEach((c) => {
      if (byId[c.id]) return
      items.push({
        id: c.id,
        name: c.name,
        preview: c.aircraft || '',
        at: null,
        unread: 0,
      })
    })
    return items.sort((a, b) => {
      if (a.at && b.at) return new Date(b.at) - new Date(a.at)
      if (a.at) return -1
      if (b.at) return 1
      return String(a.name).localeCompare(String(b.name))
    })
  }, [contacts, threads])

  const visibleList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return listItems
    return listItems.filter((i) => String(i.name).toLowerCase().includes(q))
  }, [listItems, search])

  // Insère du texte à la position du curseur (mise en forme)
  const insertAtCursor = (before, after = '') => {
    const el = textRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const selected = text.slice(start, end)
    setText(text.slice(0, start) + before + selected + after + text.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + before.length + selected.length + after.length
      el.setSelectionRange(pos, pos)
    })
  }

  // Pastille : ajoute « - » en début de ligne courante
  const insertBullet = () => {
    const el = textRef.current
    const start = el?.selectionStart ?? text.length
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    setText(text.slice(0, lineStart) + '- ' + text.slice(lineStart))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + 2
      el.setSelectionRange(pos, pos)
    })
  }

  const pickFile = (f) => {
    if (!f) return
    if (f.size > MAX_ATTACHMENT) {
      setError(`Pièce jointe trop lourde (${humanSize(f.size)}) — maximum 5 Mo.`)
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setFile({
        name: f.name,
        type: f.type || 'application/octet-stream',
        size: f.size,
        data: dataUrl.split(',')[1] || '',
      })
    }
    reader.readAsDataURL(f)
  }

  const send = async () => {
    if (!code || !contactId) return
    const body = text.trim()
    if (!body && !file) return
    setBusy(true)
    setError('')
    try {
      const res = await profileStore.msgSend(code, contactId, body, file)
      if (res?.error === 'piece_jointe_trop_lourde') setError('Pièce jointe trop lourde (5 Mo max).')
      else if (res?.error === 'message_trop_long') setError('Message trop long (4000 caractères max).')
      else if (res?.error) setError("Échec de l'envoi.")
      else {
        setText('')
        setFile(null)
        await loadThread(contactId)
        await loadLists()
      }
    } catch {
      setError("Échec de l'envoi (hors ligne ?).")
    }
    setBusy(false)
  }

  const download = async (m) => {
    try {
      const res = await profileStore.msgAttachment(code, m.id)
      if (!res?.ok) {
        setError('Pièce jointe introuvable.')
        return
      }
      const bytes = Uint8Array.from(atob(res.data || ''), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(
        new Blob([bytes], { type: res.type || 'application/octet-stream' })
      )
      const a = document.createElement('a')
      a.href = url
      a.download = res.name || 'piece-jointe'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch {
      setError('Téléchargement impossible.')
    }
  }

  const preview = async (m) => {
    try {
      const res = await profileStore.msgAttachment(code, m.id)
      if (res?.ok) setLightbox({ src: `data:${res.type};base64,${res.data}`, name: res.name })
    } catch {
      setError('Aperçu impossible.')
    }
  }

  const removeMessage = async (m) => {
    if (!window.confirm('Supprimer ce message de votre côté ?')) return
    try {
      await profileStore.msgDelete(code, m.id)
      await loadThread(contactId)
      await loadLists()
    } catch {
      setError('Suppression impossible.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Messagerie</h1>
        <p className="text-slate-600 mt-1">
          Messages entre profils — texte et pièces jointes (5 Mo max).
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="grid md:grid-cols-[290px_1fr] min-h-[70vh]">
          {/* Contacts / conversations */}
          <div className="border-r border-slate-200 flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un profil…"
                  className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto max-h-[60vh] md:max-h-none">
              {visibleList.length === 0 && (
                <li className="px-3 py-4 text-sm text-slate-400 italic">Aucun profil.</li>
              )}
              {visibleList.map((i) => {
                const active = i.id === contactId
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => setContactId(i.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-slate-50 ${
                        active ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-[#002157] to-[#003a8c] text-white text-xs font-bold flex items-center justify-center">
                        {initials(i.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-800 truncate">
                            {i.name}
                          </span>
                          {i.at && (
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {frTime(i.at)}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 truncate">{i.preview}</span>
                          {i.unread > 0 && (
                            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {i.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Conversation : un seul cadre, messages qui s'enchaînent */}
          <div className="flex flex-col min-h-[60vh]">
            {contact ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full bg-gradient-to-br from-[#002157] to-[#003a8c] text-white text-xs font-bold flex items-center justify-center">
                    {initials(contact.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{contact.name}</p>
                    {contact.aircraft && (
                      <p className="text-xs text-slate-400 truncate">✈ {contact.aircraft}</p>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 px-3 sm:px-5 py-4 space-y-2">
                  {messages === null ? (
                    <p className="text-sm text-slate-400">Chargement…</p>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-16">
                      <MessageSquare className="h-10 w-10 text-slate-300" />
                      <p className="text-sm">Aucun message — écrivez le premier.</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const prev = messages[idx - 1]
                      const newDay =
                        !prev || frDay(prev.created_at) !== frDay(m.created_at)
                      return (
                        <div key={m.id}>
                          {newDay && (
                            <p className="text-center text-[11px] text-slate-400 my-3">
                              {frDay(m.created_at)}
                            </p>
                          )}
                          <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`group relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${
                                m.mine
                                  ? 'bg-[#005c4b] text-white rounded-br-sm'
                                  : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'
                              }`}
                            >
                              {m.body && (
                                <p className="text-sm break-words leading-relaxed">
                                  <RichText text={m.body} />
                                </p>
                              )}
                              {m.attachment_name && (
                                <div className={`mt-1 ${m.body ? 'pt-1' : ''}`}>
                                  {String(m.attachment_type || '').startsWith('image/') && (
                                    <button
                                      onClick={() => preview(m)}
                                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${
                                        m.mine
                                          ? 'bg-white/15 text-white hover:bg-white/25'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                      title="Voir l'image"
                                    >
                                      🖼 {m.attachment_name}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => download(m)}
                                    className={`mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${
                                      m.mine
                                        ? 'bg-white/15 text-white hover:bg-white/25'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                    title="Télécharger la pièce jointe"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    {m.attachment_name} · {humanSize(m.attachment_size)}
                                  </button>
                                </div>
                              )}
                              <div
                                className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] ${
                                  m.mine ? 'text-emerald-100/80' : 'text-slate-400'
                                }`}
                              >
                                {frTime(m.created_at)}
                                {m.mine && m.read_at && <span title="Lu">✓✓</span>}
                              </div>
                              <button
                                onClick={() => removeMessage(m)}
                                className={`absolute -top-2 ${
                                  m.mine ? '-left-2' : '-right-2'
                                } hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-600 shadow`}
                                title="Supprimer de mon côté"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Zone de saisie */}
                <div className="border-t border-slate-100 p-3">
                  {file && (
                    <div className="mb-2 flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-xs text-slate-700">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-slate-400">{humanSize(file.size)}</span>
                      <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Barre de mise en forme (comme les pastilles des consignes) */}
                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                    <button
                      onClick={insertBullet}
                      className="h-7 px-2 rounded-md text-slate-600 hover:bg-slate-100 text-sm font-bold border border-slate-200"
                      title="Insérer une pastille (liste à puces)"
                    >
                      • Pastille
                    </button>
                    <button
                      onClick={() => insertAtCursor('*', '*')}
                      className="h-7 w-7 rounded-md text-slate-700 hover:bg-slate-100 font-bold border border-slate-200"
                      title="Gras (encadrer avec *)"
                    >
                      G
                    </button>
                    <button
                      onClick={() => insertAtCursor('_', '_')}
                      className="h-7 w-7 rounded-md text-slate-700 hover:bg-slate-100 italic border border-slate-200"
                      title="Italique (encadrer avec _)"
                    >
                      I
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowEmoji((v) => !v)}
                        className="h-7 w-7 rounded-md hover:bg-slate-100 border border-slate-200"
                        title="Emojis"
                      >
                        😊
                      </button>
                      {showEmoji && (
                        <div className="absolute bottom-full mb-1 left-0 z-40 bg-white border border-slate-200 rounded-lg shadow-xl p-2 w-56">
                          <div className="flex flex-wrap gap-0.5">
                            {EMOJIS.map((e) => (
                              <button
                                key={e}
                                onClick={() => {
                                  insertAtCursor(e)
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
                    <span className="text-[10px] text-slate-400 ml-1">
                      *gras* · _italique_ · « • Pastille » en début de ligne
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      title="Joindre un fichier (5 Mo max)"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => pickFile(e.target.files && e.target.files[0])}
                    />
                    <textarea
                      ref={textRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          send()
                        }
                      }}
                      rows={1}
                      placeholder="Écrivez un message… (Entrée pour envoyer, Maj+Entrée = nouvelle ligne)"
                      className="flex-1 resize-none border border-slate-300 rounded-2xl px-3 py-2.5 text-sm max-h-32"
                    />
                    <button
                      onClick={send}
                      disabled={busy || (!text.trim() && !file)}
                      className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
                      title="Envoyer"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 py-20">
                <MessageSquare className="h-12 w-12 text-slate-300" />
                <p className="text-sm">Choisissez un profil pour discuter.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.src}
            alt={lightbox.name}
            className="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}
