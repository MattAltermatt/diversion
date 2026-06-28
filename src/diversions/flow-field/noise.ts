// The seeded PRNG + value noise now live in the framework (shared across
// diversions). Re-exported here so existing flow-field imports keep working;
// the canonical source is `framework/rng`.
export { mulberry32, makeNoise3D } from '../../framework/rng'
