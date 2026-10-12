import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { makeId } from '../utils/helpers'

const BLOCKS = ['JIC', 'CORR', 'MPC', 'ADHOC', 'EO']
const STATUSES = ['ACTV', 'PAUSE', 'IN WORK']

export default function ManualTaskForm({
  onAdd,
  defaultBlock = 'ADHOC',
  zoneOptions = [],
  existingTasks = [],
}) {
  const [open, setOpen] = useState(false)
  const [seq, setSeq] = useState('')
  const [description, setDescription] = useState('')
  const [block, setBlock] = useState(defaultBlock)
  const [skills, setSkills] = useState('')
  const [trfx, setTrfx] = useState('')
  const [status, setStatus] = useState('ACTV')
  const [subTask, setSubTask] = useState('')
  const [registration, setRegistration] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const inputClass = 'border border-slate-300 rounded-md px-2 py-1.5 text-sm w-full'

  const reset = () => {
    setSeq('')
    setDescription('')
    setBlock(defaultBlock)
    setSkills('')
    setTrfx('')
    setStatus('ACTV')
    setSubTask('')
    setRegistration('')
    setNote('')
    setError('')
    setOpen(true)
  }

  const submit = () => {
    const desc = description.trim()
    if (!desc) {
      setError('The task (description) is required.')
      return
    }
    const seqValue = seq.trim()
    if (
      seqValue &&
      (existingTasks || []).some((t) => String(t.seq || '') === seqValue)
    ) {
      setError(
        `No. ${seqValue} already exists: choose another number (the line was not added).`
      )
      return
    }
    onAdd([
      {
        id: makeId('task'),
        seq: seq.trim() || undefined,
        description: desc,
        taskType: block,
        skills: skills.trim() || undefined,
        taskBarcode: trfx.trim() || undefined,
        mtxStatus: status,
        workArea: subTask.trim() || undefined,
        registration: registration.trim() || undefined,
        note: note.trim() || undefined,
      },
    ])
    setSeq('')
    setDescription('')
    setSkills('')
    setTrfx('')
    setStatus('ACTV')
    setSubTask('')
    setRegistration('')
    setNote('')
    setError('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={reset}
        className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 border border-sky-700 shadow-sm rounded-lg px-4 py-2.5"
        title="Add a line manually to the schedule"
      >
        <Plus className="h-4 w-4" /> Add a line
      </button>
    )
  }

  return (
    <div className="bg-sky-50/50 border border-sky-200 rounded-lg p-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">
          Line no.
          <input
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
            placeholder="e.g. 72"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Task
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Task description"
            className={`${inputClass} mt-1`}
            autoFocus
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Block
          <select
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            {BLOCKS.map((b) => (
              <option key={b} value={b}>{b === 'CORR' ? 'Found Fault' : b}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Skills
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. CABB1B2"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          TRFX
          <input
            value={trfx}
            onChange={(e) => setTrfx(e.target.value)}
            placeholder="e.g. TRFX900…"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">
          Sub-task
          <input
            value={subTask}
            onChange={(e) => setSubTask(e.target.value)}
            placeholder="Choose an existing one or type a new one"
            list="manual-task-subtasks"
            className={`${inputClass} mt-1`}
            title="Sub-task / line zone — a new value creates its own grouping"
          />
          <datalist id="manual-task-subtasks">
            {zoneOptions.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Aircraft
          <input
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            placeholder="e.g. F-GKXT"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Note (e.g. stock 0)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Detail attached to this line…"
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 italic">
          Team: <strong>unassigned</strong> — to be assigned on the Assignment page.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setError('')
              setOpen(false)
            }}
            className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 bg-sky-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-sky-700"
          >
            <Check className="h-3.5 w-3.5" /> Add the line
          </button>
        </div>
      </div>
    </div>
  )
}