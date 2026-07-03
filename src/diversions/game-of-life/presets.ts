import type { GameOfLifeConfig } from './schema'

// Style = a rule + how long its ghosts linger, as a named look.
export const stylePresets: { name: string; patch: Pick<GameOfLifeConfig, 'rule' | 'trail'> }[] = [
  { name: 'Classic',   patch: { rule: 'Life', trail: 0 } },
  { name: 'Cloud',     patch: { rule: 'Life', trail: 22 } },
  { name: 'HighLife',  patch: { rule: 'HighLife', trail: 8 } },
  { name: 'Day/Night', patch: { rule: 'Day/Night', trail: 8 } },
  { name: 'Maze',      patch: { rule: 'Maze', trail: 4 } },
  { name: 'Coral',     patch: { rule: 'Coral', trail: 6 } },
]

// Age ramps: background (dark) → young → old (bright). High contrast.
export const colorPresets: { name: string; patch: Pick<GameOfLifeConfig, 'stops'> }[] = [
  { name: 'Ember',   patch: { stops: ['#0a0612', '#ff5a1e', '#ffd36b', '#fffbe8'] } },
  { name: 'Matrix',  patch: { stops: ['#020a06', '#0f8a3a', '#5dff8a', '#eaffe8'] } },
  { name: 'Ice',     patch: { stops: ['#03060f', '#1a6fd0', '#5ad8ff', '#eafcff'] } },
  { name: 'Orchid',  patch: { stops: ['#0a0412', '#8a1fb0', '#ff6ae0', '#ffe6ff'] } },
  { name: 'Mono',    patch: { stops: ['#08080a', '#5a5a66', '#c8c8d2', '#ffffff'] } },
]
