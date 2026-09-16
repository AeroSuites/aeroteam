import { useCallback, useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import * as profileStore from '../lib/profileStore'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { hashCodeKey, currentWeekLabel } from '../utils/helpers'
import RichEditor from '../components/RichEditor'
import {
  Plus,
  X,
  Check,
  Trash2,
  Pencil,
  MessageSquare,
  ImagePlus,
  Send,
  FolderOpen,
  Folder,
  FolderPlus,
  Plane,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

const PALETTE = [
  '#0ea5e9',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
  '#a855f7',
  '#64748b',
]

// Numéro de semaine d'un nom de dossier (tolérant : « Semaine 38 », « S38 », « 38 »…)
function parseWeekNumber(name) {
  const s = String(name || '')
  const m = s.match(/(?:semaine|sem\.?|s)\s*\.?\s*[n°]*\s*(\d{1,2})\b/i)
  if (m) return parseInt(m[1], 10) || 0
  const nums = s.match(/\d{1,2}/g) || []
  for (const n of nums) {
    const v = parseInt(n, 10)
    if (v >= 1 && v <= 53) return v
  }
  return 0
}

function currentWeekNumNow() {
  return parseWeekNumber(currentWeekLabel())
}

export default function Consignes() {
  const { activeProfile, code, isAdmin } = useApp()
  const [folders, setFolders] = useState(null)
  const [error, setError] = useState('')
  const [selectedDossierId, setSelectedDossierId] = useState(null)
  const [messages, setMessages] = useState(null)
  const [messagesError, setMessagesError] = useState('')
  const [expanded, setExpanded] = useState([])

  const [currentWeekNum, setCurrentWeekNum] = useState(currentWeekNumNow)

  useEffect(() => {
    const update = () => setCurrentWeekNum(currentWeekNumNow())
    const timer = setInterval(update, 60 * 60 * 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const [folderModal, setFolderModal] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [folderCouleur, setFolderCouleur] = useState(PALETTE[0])
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderError, setFolderError] = useState('')

  const [myKey, setMyKey] = useState('')

  const [replyText, setReplyText] = useState('')
  const [replyHtml, setReplyHtml] = useState('')
  const [replyFiles, setReplyFiles] = useState([])
  const [replyPreviews, setReplyPreviews] = useState([])
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState('')

  useEffect(() => {
    let cancelled = false
    hashCodeKey(code).then((key) => {
      if (!cancelled) setMyKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [code])

  const loadFolders = useCallback(
    async (skipIfEditing) => {
      if (skipIfEditing && folderModal) return
      try {
        const res = await profileStore.getFolders()
        setError('')
        setFolders(res?.folders || [])
      } catch {
        setError('Impossible de charger les consignes (hors ligne ?).')
      }
    },
    [folderModal]
  )

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- chargement initial
    loadFolders(false)
    const timer = setInterval(() => loadFolders(true), 15000)
    return () => clearInterval(timer)
  }, [loadFolders])

  const loadMessages = useCallback(async (dossierId) => {
    try {
      const res = await profileStore.getMessages(dossierId)
      setMessagesError('')
      setMessages(res?.messages || [])
    } catch {
      setMessagesError('Impossible de charger la conversation (hors ligne ?).')
      setMessages([])
    }
  }, [])

  useEffect(() => {
    if (!selectedDossierId) {
      // eslint-disable-next-line react/set-state-in-effect -- fermeture de la conversation
      setMessages(null)
      setMessagesError('')
      return
    }
    // eslint-disable-next-line react/set-state-in-effect -- ouverture de la conversation
    setMessages(null)
    loadMessages(selectedDossierId)
    const timer = setInterval(() => loadMessages(selectedDossierId), 15000)
    return () => clearInterval(timer)
  }, [selectedDossierId, loadMessages])

  const folderMap = useMemo(() => new Map((folders || []).map((f) => [f.id, f])), [folders])

  // Arborescence : semaines -> avions (conversations)
  const tree = useMemo(() => {
    const byParent = {}
    ;(folders || []).forEach((f) => {
      const key = f.parent_id || 'root'
      if (!byParent[key]) byParent[key] = []
      byParent[key].push(f)
    })
    const weeks = (byParent.root || [])
      .map((wf) => ({
        folder: wf,
        weekNum: parseWeekNumber(wf.name),
        children: (byParent[wf.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        const aCur = currentWeekNum > 0 && a.weekNum === currentWeekNum
        const bCur = currentWeekNum > 0 && b.weekNum === currentWeekNum
        if (aCur !== bCur) return aCur ? -1 : 1
        return b.weekNum - a.weekNum
      })
    const orphanMessages = selectedDossierId === '__none__' || messages?.length
    if (orphanMessages && !weeks.some((w) => w.folder.id === '__sans_dossier__')) {
      // dossier virtuel : messages orphelins éventuels visibles au besoin
    }
    return weeks
  }, [folders, selectedDossierId, messages, currentWeekNum])

  const currentFolder = useMemo(
    () => tree.find((w) => currentWeekNum > 0 && w.weekNum === currentWeekNum)?.folder || null,
    [tree, currentWeekNum]
  )

  const totalAvions = useMemo(
    () => (folders || []).filter((f) => f.parent_id).length,
    [folders]
  )

  const toggleWeek = (id) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }

  const openFolderModal = (mode, folder) => {
    setFolderModal({ mode, folder: folder || null, parentId: folder ? folder.id : null })
    setFolderName(mode === 'rename' && folder ? folder.name : '')
    setFolderCouleur(folder ? folder.couleur || PALETTE[0] : PALETTE[0])
    setFolderError('')
  }

  const saveFolder = async () => {
    const name = folderName.trim()
    if (!name) {
      setFolderError('Le nom du dossier est obligatoire.')
      return
    }
    setFolderSaving(true)
    setFolderError('')
    try {
      if (folderModal.mode === 'new') {
        const res = await profileStore.addFolder(
          folderModal.parentId,
          name,
          folderCouleur,
          activeProfile?.name || ''
        )
        await loadFolders(false)
        if (res?.id && folderModal.parentId) {
          setExpanded((prev) => (prev.includes(folderModal.parentId) ? prev : [...prev, folderModal.parentId]))
        }
      } else if (folderModal.folder) {
        await profileStore.renameFolder(folderModal.folder.id, name)
        await loadFolders(false)
      }
      setFolderModal(null)
    } catch {
      setFolderError('Échec de l’enregistrement (hors ligne ?).')
    }
    setFolderSaving(false)
  }

  const removeFolder = async (folder) => {
    const isWeek = !folder.parent_id
    if (
      !window.confirm(
        `Supprimer le dossier « ${folder.name} » ?` +
          (isWeek
            ? '\n\nTous ses sous-dossiers et leurs conversations seront supprimés.'
            : '\n\nToute sa conversation sera supprimée.') +
          '\nCette action est irréversible.'
      )
    ) {
      return
    }
    if (isWeek) {
      const confirmedTwice = window.confirm(
        `DERNIÈRE VÉRIFICATION — semaine « ${folder.name} »\n\n` +
          'Cliquez OK pour supprimer DÉFINITIVEMENT cette semaine, tous ses dossiers avions ' +
          'et toutes leurs conversations.\n\n' +
          'Cette suppression est IRRÉVERSIBLE. En cas de doute, cliquez Annuler.'
      )
      if (!confirmedTwice) return
    }
    try {
      await profileStore.deleteFolder(folder.id, code)
      if (selectedDossierId === folder.id) setSelectedDossierId(null)
      setExpanded((prev) => prev.filter((f) => f !== folder.id))
      await loadFolders(false)
    } catch {
      setError("Impossible de supprimer le dossier (hors ligne ?).")
    }
  }

  const removeReply = async (m) => {
    if (!window.confirm('Supprimer cette réponse ? Cette action est irréversible.')) return
    try {
      const res = await profileStore.deleteMessage(m.id, myKey, code)
      if (res?.error === 'not_authorized') {
        setMessagesError('Vous ne pouvez supprimer que vos propres réponses.')
        return
      }
      if (selectedDossierId) await loadMessages(selectedDossierId)
    } catch {
      setMessagesError("Impossible de supprimer la réponse (hors ligne ?).")
    }
  }

  const onPickFiles = (fileList) => {
    const files = Array.from(fileList || []).slice(0, 5 - replyFiles.length)
    if (!files.length) return
    setReplyFiles((prev) => [...prev, ...files])
    setReplyPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))])
  }

  const removePendingFile = (idx) => {
    setReplyFiles((prev) => prev.filter((_, i) => i !== idx))
    setReplyPreviews((prev) => {
      URL.revokeObjectURL(prev[idx])
      return prev.filter((_, i) => i !== idx)
    })
  }

  const sendReply = async () => {
    if (!replyText && replyFiles.length === 0) return
    if (!selectedDossierId) return
    setSending(true)
    setReplyError('')
    try {
      const urls = []
      for (let i = 0; i < replyFiles.length; i++) {
        const file = replyFiles[i]
        const path = `msg-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`
        const { error: uploadError } = await supabase.storage
          .from('consignes-images')
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('consignes-images').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      await profileStore.addMessage(
        selectedDossierId,
        replyText,
        replyHtml,
        urls,
        activeProfile?.name || '',
        myKey
      )
      setReplyText('')
      setReplyHtml('')
      replyPreviews.forEach((p) => URL.revokeObjectURL(p))
      setReplyFiles([])
      setReplyPreviews([])
      await loadMessages(selectedDossierId)
      await loadFolders(false)
    } catch (err) {
      setReplyError(
        `Échec de l’envoi : ${err?.message || 'hors ligne ? photo trop lourde ?'}`
      )
    }
    setSending(false)
  }

  const selectedFolder =
    selectedDossierId === '__none__'
      ? null
      : folderMap.get(selectedDossierId) || null

  const selectedPath = useMemo(() => {
    if (selectedDossierId === '__none__') return 'Sans dossier'
    if (!selectedFolder) return ''
    const wf = selectedFolder.parent_id
      ? folderMap.get(selectedFolder.parent_id)
      : null
    return wf ? `${wf.name} / ${selectedFolder.name}` : selectedFolder.name
  }, [selectedDossierId, selectedFolder, folderMap])

  const canSend = !sending && (replyText !== '' || replyFiles.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Consignes</h1>
        <p className="text-slate-600 mt-1">
          Dossiers partagés entre tous les profils — ouvrez un avion pour accéder directement à sa
          conversation.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Arborescence des dossiers */}
        <div className="space-y-3">
          <button
            onClick={() => openFolderModal('new', null)}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
            title="Créer un dossier semaine (ex : Semaine 37)"
          >
            <FolderPlus className="h-4 w-4" /> Dossier semaine
          </button>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {folders === null && !error && <p className="text-sm text-slate-400 p-4">Chargement…</p>}
            {folders && folders.length === 0 && (
              <p className="text-sm text-slate-500 p-4">
                Aucun dossier. Créez un dossier semaine (ex : « Semaine 37 »), puis ajoutez-y un
                sous-dossier par immatriculation d'avion.
              </p>
            )}
            {tree.map(({ folder: wf, weekNum, children }) => {
              const weekOpen = expanded.includes(wf.id)
              const isCurrent = weekNum === currentWeekNum && currentWeekNum > 0
              return (
                <div key={wf.id}>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b border-slate-100 transition-colors ${
                      isCurrent
                        ? 'bg-amber-50 border-l-4 border-l-amber-500'
                        : weekOpen
                        ? 'bg-slate-100'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => toggleWeek(wf.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      title={weekOpen ? `Replier « ${wf.name} »` : `Ouvrir « ${wf.name} »`}
                    >
                      {weekOpen ? (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      {weekOpen ? (
                        <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span
                        className={`min-w-0 truncate ${
                          isCurrent
                            ? 'font-bold text-amber-900'
                            : weekOpen
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-700'
                        }`}
                      >
                        {wf.name}
                      </span>
                      {isCurrent && (
                        <span
                          className="ml-1 shrink-0 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-semibold leading-none"
                          title="Semaine en cours"
                        >
                          en cours
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0 pl-1">
                        {children.length} av.
                      </span>
                    </button>
                    {!wf.id.startsWith('__') && (
                      <>
                        <button
                          onClick={() => openFolderModal('new', wf)}
                          className="text-slate-400 hover:text-sky-600 p-0.5 shrink-0"
                          title={`Ajouter un avion dans « ${wf.name} »`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openFolderModal('rename', wf)}
                          className="text-slate-400 hover:text-sky-600 p-0.5 shrink-0"
                          title={`Renommer « ${wf.name} »`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => removeFolder(wf)}
                            className="text-slate-400 hover:text-red-600 p-0.5 shrink-0"
                            title={`Supprimer « ${wf.name} » (administrateur uniquement)`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {weekOpen &&
                    children.map((af) => {
                      const active = af.id === selectedDossierId
                      return (
                        <div
                          key={af.id}
                          className={`pl-9 pr-2 flex items-center gap-2 border-b border-slate-50 transition-colors ${
                            active ? 'bg-sky-50' : 'bg-slate-50/60 hover:bg-slate-100'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedDossierId(af.id)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left py-2.5"
                            title={`Ouvrir la conversation de « ${af.name} »`}
                          >
                            <Plane className="h-4 w-4 text-sky-500 shrink-0" />
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: af.couleur || '#0ea5e9' }}
                            />
                            <span
                              className={`truncate text-sm ${
                                active ? 'font-semibold text-sky-900' : 'text-slate-700'
                              }`}
                            >
                              {af.name}
                            </span>
                          </button>
                          {!af.id.startsWith('__') && (
                            <>
                              <button
                                onClick={() => openFolderModal('rename', af)}
                                className="text-slate-400 hover:text-sky-600 p-0.5 shrink-0"
                                title={`Renommer « ${af.name} »`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => removeFolder(af)}
                                  className="text-slate-400 hover:text-red-600 p-0.5 shrink-0"
                                  title={`Supprimer « ${af.name} » (administrateur uniquement)`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            })}
            <p className="text-[11px] text-slate-400 px-4 py-2">
              {totalAvions} avion{totalAvions > 1 ? 's' : ''} au total
              {' · '}semaine en cours :{' '}
              {currentWeekNum > 0 ? `S${currentWeekNum}` : 'non détectée'}
              {currentWeekNum > 0 &&
                (currentFolder
                  ? ` — dossier « ${currentFolder.name} »`
                  : ' — aucun dossier ne correspond')}
            </p>
          </div>
        </div>

        {/* Conversation */}
        <div className="bg-white rounded-xl shadow flex flex-col min-h-[420px]">
          {!selectedDossierId && (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-slate-400">
              <MessageSquare className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm">
                {totalAvions > 0
                  ? 'Ouvrez une semaine, puis cliquez sur un avion pour lire sa conversation.'
                  : 'Créez un dossier semaine, puis un sous-dossier par avion.'}
              </p>
            </div>
          )}

          {selectedDossierId && (
            <>
              <div
                className="px-5 py-3 flex items-center justify-between gap-3"
                style={{ backgroundColor: selectedFolder?.couleur || '#0ea5e9' }}
              >
                <div className="min-w-0">
                  <h2 className="font-bold text-white text-lg truncate">
                    {selectedFolder?.name || 'Sans dossier'}
                  </h2>
                  <p className="text-white/90 text-xs">
                    <span className="font-semibold">{selectedPath}</span>
                    {' · '}
                    {selectedFolder?.updated_by
                      ? `dernière activité par ${selectedFolder.updated_by}`
                      : 'dernière activité'}{' '}
                    ·{' '}
                    {selectedFolder?.updated_at
                      ? new Date(selectedFolder.updated_at).toLocaleString('fr-FR')
                      : ''}
                  </p>
                </div>
                {selectedFolder && !selectedFolder.id.startsWith('__') && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openFolderModal('rename', selectedFolder)}
                      className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
                      title={`Renommer « ${selectedFolder.name} »`}
                    >
                      <Pencil className="h-4 w-4" /> Renommer
                    </button>
                    <button
                      onClick={() => removeFolder(selectedFolder)}
                      className="text-white/80 hover:text-white p-2"
                      title={`Supprimer « ${selectedFolder.name} » et sa conversation`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {messagesError && (
                <p className="m-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {messagesError}
                </p>
              )}

              <div className="flex-1 overflow-y-auto max-h-[50vh] p-4 space-y-3">
                {messages === null && <p className="text-sm text-slate-400 p-2">Chargement…</p>}
                {messages && messages.length === 0 && (
                  <p className="text-sm text-slate-400 p-2">
                    Aucune réponse pour le moment. Écrivez la première.
                  </p>
                )}
                {messages &&
                  messages.map((m) => {
                    const mine = m.auteur_key && m.auteur_key === myKey
                    const canDelete = mine || isAdmin
                    return (
                      <div
                        key={m.id}
                        className={`border rounded-lg overflow-hidden ${
                          mine ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200'
                        }`}
                      >
                        <div
                          className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${
                            mine ? 'bg-sky-100/60 border-sky-100' : 'bg-slate-50 border-slate-100'
                          }`}
                        >
                          <span className="text-xs font-semibold text-slate-700">
                            {m.auteur || '—'}{' '}
                            <span className="font-normal text-slate-400">
                              · {new Date(m.created_at).toLocaleString('fr-FR')}
                            </span>
                          </span>
                          {canDelete && (
                            <button
                              onClick={() => removeReply(m)}
                              className="text-slate-400 hover:text-red-600"
                              title={
                                mine
                                  ? 'Supprimer votre réponse'
                                  : 'Supprimer cette réponse (administrateur)'
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="p-3">
                          {m.contenu_html ? (
                            <div
                              className="message-html text-sm text-slate-800"
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(m.contenu_html),
                              }}
                            />
                          ) : m.contenu ? (
                            <p className="whitespace-pre-wrap text-sm text-slate-800">{m.contenu}</p>
                          ) : null}
                          {(m.images || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {(m.images || []).map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer" title="Ouvrir la photo en grand">
                                  <img
                                    src={url}
                                    alt={m.contenu ? m.contenu.slice(0, 40) : 'photo'}
                                    className="h-28 w-28 object-cover rounded-md border border-slate-200 bg-slate-100"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>

              {/* Saisie d'une réponse */}
              <div className="border-t p-4 bg-slate-50">
                <RichEditor
                  onChange={(html, text) => {
                    setReplyHtml(html)
                    setReplyText(text)
                  }}
                  placeholder={`Répondre dans ${selectedFolder?.name || 'ce dossier'}…`}
                  minHeight={70}
                />
                {replyPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {replyPreviews.map((preview, i) => (
                      <div key={i} className="relative">
                        <img
                          src={preview}
                          alt="À envoyer"
                          className="h-16 w-16 object-cover rounded-md border border-slate-300"
                        />
                        <button
                          onClick={() => removePendingFile(i)}
                          className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5"
                          title="Retirer la photo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {replyError && <p className="text-sm text-red-600 mt-2">{replyError}</p>}
                <div className="flex items-center justify-between gap-2 mt-2">
                  <label
                    className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-3 py-2 rounded-md hover:bg-slate-300 text-sm cursor-pointer"
                    title={`Ajouter des photos (${replyFiles.length}/5)`}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {replyFiles.length > 0 ? `Photos (${replyFiles.length})` : 'Ajouter des photos'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        onPickFiles(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    onClick={sendReply}
                    disabled={!canSend}
                    className="flex items-center gap-1.5 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                  >
                    <Send className="h-4 w-4" /> {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modale dossier */}
      {folderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setFolderModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-900 text-white rounded-t-xl">
              <h2 className="font-bold">
                {folderModal.mode === 'new'
                  ? folderModal.parentId
                    ? 'Nouveau dossier avion'
                    : 'Nouveau dossier semaine'
                  : 'Renommer le dossier'}
              </h2>
              <button
                onClick={() => setFolderModal(null)}
                className="text-slate-400 hover:text-white p-1"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {folderModal.parentId ? "Immatriculation de l'avion" : 'Nom de la semaine'}
                </label>
                <input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder={folderModal.parentId ? 'Ex : F-GKXT' : 'Ex : Semaine 37'}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              {folderModal.mode === 'new' && folderModal.parentId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Couleur de la conversation
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((color) => (
                      <button
                        key={color}
                        onClick={() => setFolderCouleur(color)}
                        className={`h-8 w-8 rounded-full transition-transform ${
                          folderCouleur === color ? 'ring-2 ring-slate-800 ring-offset-2 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
              {folderError && <p className="text-sm text-red-600">{folderError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFolderModal(null)}
                  className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  onClick={saveFolder}
                  disabled={folderSaving}
                  className="flex items-center gap-1.5 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                >
                  <Check className="h-4 w-4" />
                  {folderSaving ? 'Enregistrement…' : folderModal.mode === 'rename' ? 'Renommer' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}