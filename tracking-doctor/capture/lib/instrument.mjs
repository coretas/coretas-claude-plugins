export const BINDING_NAME = '__trackingDoctorPush'

/**
 * Runs in the page before any site script. Wraps the dataLayer array so every
 * push is reported out through an exposed binding, in order, including pushes
 * made by the GTM snippet itself before it hands off.
 *
 * Reporting through a binding rather than reading the array at the end means
 * hard navigations and SPA route changes need no merge bookkeeping: the
 * ordering is the call ordering.
 */
export function installDataLayerHook({ bindingName, names, maxDepth }) {
  const report = (name, index, value) => {
    try {
      window[bindingName]({ source: name, index, value: serialise(value, 0, new WeakSet()) })
    } catch {
      /* binding gone (page closing) — nothing useful to do */
    }
  }

  function serialise(value, depth, seen) {
    if (value === null) return null
    const type = typeof value
    if (type === 'string' || type === 'number' || type === 'boolean') return value
    if (type === 'undefined') return { __type: 'undefined' }
    if (type === 'function') return { __type: 'function', name: value.name || '' }
    if (type === 'symbol') return { __type: 'symbol', description: String(value.description ?? '') }
    if (type === 'bigint') return { __type: 'bigint', value: String(value) }
    if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return { __type: 'element', tagName: value.tagName }
    }
    if (depth >= maxDepth) return { __type: 'truncated' }
    if (seen.has(value)) return { __type: 'circular' }
    seen.add(value)
    if (Array.isArray(value)) return value.map((item) => serialise(item, depth + 1, seen))
    // gtag() pushes its `arguments` object, not a plain array.
    if (Object.prototype.toString.call(value) === '[object Arguments]') {
      return {
        __type: 'arguments',
        values: Array.prototype.slice.call(value).map((item) => serialise(item, depth + 1, seen)),
      }
    }
    const out = {}
    for (const key of Object.keys(value)) {
      try {
        out[key] = serialise(value[key], depth + 1, seen)
      } catch {
        out[key] = { __type: 'unreadable' }
      }
    }
    return out
  }

  const hook = (array, name) => {
    if (!Array.isArray(array) || array.__trackingDoctorHooked) return array
    try {
      Object.defineProperty(array, '__trackingDoctorHooked', { value: true, enumerable: false })
    } catch {
      return array
    }
    // Entries assigned before we saw the array still count as observed pushes.
    for (let i = 0; i < array.length; i += 1) report(name, i, array[i])
    const originalPush = array.push
    array.push = function trackingDoctorPush(...args) {
      const base = this.length
      const result = originalPush.apply(this, args)
      args.forEach((arg, offset) => report(name, base + offset, arg))
      return result
    }
    return array
  }

  for (const name of names) {
    let current = window[name]
    if (Array.isArray(current)) hook(current, name)
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          return current
        },
        set(value) {
          // GTM's `window.dataLayer = window.dataLayer || []` lands here.
          current = Array.isArray(value) ? hook(value, name) : value
        },
      })
    } catch {
      /* a frozen window is rare but not worth failing the capture over */
    }
  }
}
