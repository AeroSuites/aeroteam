import { dedupeAndMerge } from '../utils/helpers'

export function taskActions({ tasks, setTasks, setAssignments }) {
  const addTasks = (newTasks) => {
    setTasks((prev) => dedupeAndMerge(prev, newTasks))
  }

  const assignTask = (taskId, teamId) => {
    setAssignments((prev) => {
      const cur = Array.isArray(prev[taskId])
        ? prev[taskId]
        : prev[taskId]
          ? [prev[taskId]]
          : []
      return { ...prev, [taskId]: cur.includes(teamId) ? cur : [...cur, teamId] }
    })
  }

  const unassignTask = (taskId, teamId) => {
    setAssignments((prev) => {
      const cur = (Array.isArray(prev[taskId]) ? prev[taskId] : []).filter(
        (id) => id !== teamId
      )
      const next = { ...prev }
      if (cur.length > 0) next[taskId] = cur
      else delete next[taskId]
      return next
    })
  }

  const removeTask = (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setAssignments((prev) => {
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }

  const updateTask = (taskId, updates) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)))
  }

  const removeTasksByBlock = (block) => {
    const idsToRemove = tasks.filter((t) => t.taskType === block).map((t) => t.id)
    setTasks((prev) => prev.filter((t) => t.taskType !== block))
    setAssignments((prev) => {
      const next = { ...prev }
      idsToRemove.forEach((id) => delete next[id])
      return next
    })
  }

  // Supprime toutes les tâches d'une sous-tâche (zone).
  // Si `block` est fourni, seule cette sous-tâche DU bloc est supprimée
  // (ex. Found Fault > CAB WASTE sans toucher au JIC > CAB WASTE).
  const removeTasksByZone = (zone, block) => {
    const match = (t) =>
      (t.workArea || 'Autre') === zone &&
      (!block || (t.taskType || 'AUTRE') === block)
    const idsToRemove = tasks.filter(match).map((t) => t.id)
    setTasks((prev) => prev.filter((t) => !match(t)))
    setAssignments((prev) => {
      const next = { ...prev }
      idsToRemove.forEach((id) => delete next[id])
      return next
    })
  }

  // Supprime une liste de tâches (par ids) — sert au déplacement vers la Préparation
  const removeTasksByIds = (ids) => {
    const set = new Set(ids || [])
    if (set.size === 0) return
    setTasks((prev) => prev.filter((t) => !set.has(t.id)))
    setAssignments((prev) => {
      const next = { ...prev }
      set.forEach((id) => delete next[id])
      return next
    })
  }

  return {
    addTasks,
    assignTask,
    unassignTask,
    removeTask,
    removeTasksByBlock,
    removeTasksByZone,
    removeTasksByIds,
    updateTask,
  }
}