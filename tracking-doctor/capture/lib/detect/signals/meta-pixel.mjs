import { SIGNALS } from '../vocabulary.mjs'
import { detectPixel } from './pixel.mjs'

const META = Object.freeze({ signal: SIGNALS.metaPixel, name: 'Meta Pixel', pageview: 'PageView' })

export function detectMetaPixel(evidence) {
  return detectPixel(META, evidence.meta)
}
