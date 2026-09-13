import { makeId } from '../utils/helpers'

export function teamActions({ setTeams, setAssignments, setMembers, setDayMembers }) {
  const addTeam = (team) => {
    setTeams((prev) => [...prev, { ...team, locked: false, id: makeId('team') }])
  }

  const updateTeam = (id, updates) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const removeTeam = (id) => {
    setTeams((prev) => prev.filter((t) => t.id !== id))
    setAssignments((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((k) => {
        if (next[k] === id) delete next[k]
      })
      return next
    })
  }

  const addMember = (name) => {
    const trimmed = String(name).trim()
    if (!trimmed) return
    setMembers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
  }

  const addMembers = (names) => {
    setMembers((prev) => {
      const next = [...prev]
      names.forEach((n) => {
        const trimmed = String(n).trim()
        if (trimmed && !next.includes(trimmed)) next.push(trimmed)
      })
      return next
    })
  }

  const addDayMember = (name) => {
    const trimmed = String(name).trim()
    if (!trimmed) return
    setDayMembers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
  }

  const addDayMembers = (names) => {
    setDayMembers((prev) => {
      const next = [...prev]
      names.forEach((n) => {
        const trimmed = String(n).trim()
        if (trimmed && !next.includes(trimmed)) next.push(trimmed)
      })
      return next
    })
  }

  const clearDayMembers = (names) => {
    setDayMembers([])
    const toRemove = Array.isArray(names) ? names : []
    if (toRemove.length === 0) return
    setTeams((prev) =>
      prev.map((t) =>
        t.members.some((m) => toRemove.includes(m))
          ? { ...t, members: t.members.filter((m) => !toRemove.includes(m)) }
          : t
      )
    )
  }

  const removeMember = (name) => {
    setMembers((prev) => prev.filter((m) => m !== name))
    setDayMembers((prev) => prev.filter((m) => m !== name))
    setTeams((prev) =>
      prev.map((t) =>
        t.members.includes(name) ? { ...t, members: t.members.filter((m) => m !== name) } : t
      )
    )
  }

  return {
    addTeam,
    updateTeam,
    removeTeam,
    addMember,
    addMembers,
    addDayMember,
    addDayMembers,
    clearDayMembers,
    removeMember,
  }
}