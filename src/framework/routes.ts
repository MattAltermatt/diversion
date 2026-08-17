/** The single spelling of the diversion route's path segment.
 *
 *  It exists because it is duplicated in two places that no test and no type would
 *  ever reconcile: React Router's route definitions in `App.tsx`, and the regex inside
 *  the inline preload script that `preloadMap.ts` emits into `index.html` (#291).
 *  Renaming the route with the regex left behind is silent in the worst way — the map
 *  still ships, the links are simply never created, and `npm test`, `npm run build`
 *  and `npm run check:preload` all stay green while the optimisation is gone. */
export const DIVERSION_SEGMENT = 'd'

/** Path to a diversion's config screen. `${path}/play` is its play screen. */
export const diversionPath = (slug: string): string => `/${DIVERSION_SEGMENT}/${slug}`
