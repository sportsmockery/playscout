import { QBIQ_RUBRIC } from './qbiq'
import { OLIQ_RUBRIC } from './oliq'
import { RBIQ_RUBRIC } from './rbiq'
import { cueCatalogFor, type ModuleRubric } from './types'

export { QBIQ_RUBRIC } from './qbiq'
export { OLIQ_RUBRIC } from './oliq'
export { RBIQ_RUBRIC } from './rbiq'
export * from './types'
export * from './drills'
export * from './render'

/** Rubrics by module key, for the modules that grade an individual player. */
export const RUBRICS: Record<string, ModuleRubric> = {
  QBIQ: QBIQ_RUBRIC,
  OLIQ: OLIQ_RUBRIC,
  RBIQ: RBIQ_RUBRIC,
}

/**
 * Cue catalogs derived from the rubrics, so the closed list the breakdown
 * enforces can never drift from the cues the prompt describes.
 */
export const QBIQ_CUES = cueCatalogFor(QBIQ_RUBRIC)
export const OLIQ_CUES = cueCatalogFor(OLIQ_RUBRIC)
export const RBIQ_CUES = cueCatalogFor(RBIQ_RUBRIC)
