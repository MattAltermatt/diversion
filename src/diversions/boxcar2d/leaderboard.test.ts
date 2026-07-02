import { describe, it, expect } from 'vitest'
import { updateLeaderboard, championLabel, type Champion } from './leaderboard'
import { randomGenome, type Genome } from './genome'
import { mulberry32 } from '../../framework/rng'
import { staticCarShape } from './car'

const rng = mulberry32(7)
function champ(fitness: number, genome: Genome = randomGenome(rng)): Champion {
  return { genome, fitness, label: `${fitness}`, shape: staticCarShape(genome) }
}

describe('updateLeaderboard', () => {
  it('sorts fitness-descending and caps at capacity', () => {
    let board: Champion[] = []
    for (const f of [10, 50, 30, 20, 40, 5, 60]) board = updateLeaderboard(board, champ(f), 5)
    expect(board.map((c) => c.fitness)).toEqual([60, 50, 40, 30, 20])
  })

  it('drops an entry that does not make the cut', () => {
    let board: Champion[] = []
    for (const f of [100, 90, 80, 70, 60]) board = updateLeaderboard(board, champ(f), 5)
    board = updateLeaderboard(board, champ(1), 5)
    expect(board).toHaveLength(5)
    expect(board.some((c) => c.fitness === 1)).toBe(false)
  })

  it('dedups by genome reference (an elite re-running) rather than duplicating', () => {
    const g = randomGenome(rng)
    let board: Champion[] = []
    board = updateLeaderboard(board, champ(42, g), 5)
    board = updateLeaderboard(board, champ(42, g), 5) // same ref, next generation
    expect(board).toHaveLength(1)
  })

  it('keeps the higher fitness when the same genome re-scores', () => {
    const g = randomGenome(rng)
    let board = updateLeaderboard([], champ(30, g), 5)
    board = updateLeaderboard(board, { ...champ(55, g), label: 'better' }, 5)
    expect(board[0].fitness).toBe(55)
    expect(board[0].label).toBe('better')
    // a lower re-score does not clobber the stored higher one
    board = updateLeaderboard(board, { ...champ(10, g), label: 'worse' }, 5)
    expect(board[0].fitness).toBe(55)
    expect(board[0].label).toBe('better')
  })

  it('does not mutate the input board', () => {
    const board = updateLeaderboard([], champ(10), 5)
    const snapshot = [...board]
    updateLeaderboard(board, champ(99), 5)
    expect(board).toEqual(snapshot)
  })
})

describe('championLabel', () => {
  it('formats a time-mode finisher as seconds', () => {
    expect(championLabel('time', true, 12.37, 500)).toBe('12.4s')
  })
  it('formats a time-mode non-finisher as distance', () => {
    expect(championLabel('time', false, 40, 342.6)).toBe('343 m')
  })
  it('formats distance mode as distance', () => {
    expect(championLabel('distance', false, 0, 128.2)).toBe('128 m')
  })
})
