import { describe, it, expect } from 'vitest'
import { groupTasksTree } from './TaskTreeSelect'

describe('groupTasksTree — priorités vac 01 / vac 02 (colonne shift)', () => {
  it('met les blocs et lignes prioritaires en premier', () => {
    const tree = groupTasksTree([
      { id: 'a', seq: '1', taskType: 'CORR', workArea: 'ZL1', shift: '' },
      { id: 'b', seq: '2', taskType: 'JIC', workArea: 'ZL2', shift: 'vac 02' },
      { id: 'c', seq: '3', taskType: 'JIC', workArea: 'ZL2', shift: 'vac 01' },
      { id: 'd', seq: '4', taskType: 'MPC', workArea: 'ZL3', shift: '' },
    ])
    // Le bloc JIC contient la priorité 1 -> en tête ; CORR (sans priorité) après
    expect(tree.map((b) => b.block)).toEqual(['JIC', 'CORR', 'MPC'])
    const jic = tree.find((b) => b.block === 'JIC')
    expect(jic.zones[0].tasks.map((t) => t.id)).toEqual(['c', 'b'])
  })

  it('sans priorité, garde l’ordre du fichier (N°)', () => {
    const tree = groupTasksTree([
      { id: 'x', seq: '2', taskType: 'JIC', workArea: 'ZL1', shift: '' },
      { id: 'y', seq: '1', taskType: 'JIC', workArea: 'ZL1', shift: '' },
    ])
    expect(tree[0].zones[0].tasks.map((t) => t.id)).toEqual(['y', 'x'])
  })
})
