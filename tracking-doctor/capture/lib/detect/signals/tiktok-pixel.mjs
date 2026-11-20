import { SIGNALS } from '../vocabulary.mjs'
import { detectPixel } from './pixel.mjs'

/** `ttq.page()` sends `Pageview`, lower-case v — not Meta's `PageView`. */
const TIKTOK = Object.freeze({ signal: SIGNALS.tiktokPixel, name: 'TikTok Pixel', pageview: 'Pageview' })

export function detectTikTokPixel(evidence) {
  return detectPixel(TIKTOK, evidence.tiktok)
}
