// phaser-box2d (Box2D v3) ships no type declarations. The diversion never touches
// it directly — every access goes through the typed seam in physics.ts — so an
// `any` module here is the correct, contained boundary.
declare module 'phaser-box2d/dist/PhaserBox2D.js'
