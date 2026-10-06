import { dedupeAndMerge } from '../utils/helpers'

export function prepActions({ setPrepTasks, setPockets }) {
  const addPrepTasks = (newTasks) => {
    setPrepTasks((prev) => dedupeAndMerge(prev, newTasks))
  }

  const removePrepTask = (taskId) => {
    setPrepTasks((prev) => prev.filter((t) => t.id !== taskId))
    setPockets((prev) =>
      prev.map((p) => ({ ...p, taskIds: p.taskIds.filter((id) => id !== taskId) }))
    )
  }

  const removePrepTasksByBlock = (block) => {
    setPrepTasks((prev) => {
      const removedIds = prev.filter((t) => t.taskType === block).map((t) => t.id)
      setPockets((prevPockets) =>
        prevPockets.map((p) => ({
          ...p,
          taskIds: p.taskIds.filter((id) => !removedIds.includes(id)),
        }))
      )
      return prev.filter((t) => t.taskType !== block)
    })
  }

  // Supprime toutes les lignes d'une sous-tâche (zone), éventuellement d'un seul bloc
  const removePrepTasksByZone = (zone, block) => {
    setPrepTasks((prev) => {
      const match = (t) =>
        (t.workArea || 'Autre') === zone &&
        (!block || (t.taskType || 'AUTRE') === block)
      const removedIds = prev.filter(match).map((t) => t.id)
      setPockets((prevPockets) =>
        prevPockets.map((p) => ({
          ...p,
          taskIds: p.taskIds.filter((id) => !removedIds.includes(id)),
        }))
      )
      return prev.filter((t) => !match(t))
    })
  }

  // Supprime une liste de lignes (par ids), et les retire des pochettes
  const removePrepTasksByIds = (ids) => {
    const set = new Set(ids || [])
    if (set.size === 0) return
    setPrepTasks((prev) => prev.filter((t) => !set.has(t.id)))
    setPockets((prevPockets) =>
      prevPockets.map((p) => ({
        ...p,
        taskIds: p.taskIds.filter((id) => !set.has(id)),
      }))
    )
  }

  const updatePrepTask = (taskId, updates) => {
    setPrepTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)))
  }

  // Mise a jour de plusieurs lignes en une seule fois (deplacement multiple)
  const updatePrepTasks = (ids, updates) => {
    const set = new Set(ids || [])
    setPrepTasks((prev) => prev.map((t) => (set.has(t.id) ? { ...t, ...updates } : t)))
  }

  const clearPrepTasks = () => {
    setPrepTasks([])
    setPockets([])
  }

  return {
    addPrepTasks,
    removePrepTask,
    removePrepTasksByBlock,
    removePrepTasksByZone,
    removePrepTasksByIds,
    updatePrepTask,
    updatePrepTasks,
    clearPrepTasks,
  }
}