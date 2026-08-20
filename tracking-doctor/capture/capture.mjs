#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
  ArtefactError,
  canonicalise,
  normalise,
  parseArtefact,
  stableStringify,
} from './lib/artefact.mjs'
import { NoBrowserError } from './lib/browser.mjs'
import { DEFAULTS, capture } from './lib/run.mjs'

const USAGE = `tracking-doctor-capture

  capture <url> [options]     render a page and record what tracking fires
  replay  <artefact.json>     re-derive the normalised capture, offline

Options
  --out <file>                write output here instead of stdout
  --timeout <ms>              overall budget (default ${DEFAULTS.timeoutMs})
  --settle <ms>               network quiet period (default ${DEFAULTS.settleMs})
  --consent <accept|none>     dismiss consent banners (default ${DEFAULTS.consent})
  --route <path>              SPA route to visit after load; repeatable
  --datalayer-name <name>     extra dataLayer global to hook; repeatable
  --viewport <WxH>            default ${DEFAULTS.viewport.width}x${DEFAULTS.viewport.height}
  --raw                       capture: emit the artefact instead of the normalised capture
  --canonical                 drop timings, browser identity and origins (goldens)
  --headed                    capture: show the browser (debugging)
`

const EXIT = { ok: 0, error: 1, usage: 2 }

async function main(argv) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(USAGE)
    return EXIT.ok
  }

  let args
  try {
    args = parseArgs(rest)
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`)
    return EXIT.usage
  }

  if (command === 'capture') return runCapture(args)
  if (command === 'replay') return runReplay(args)

  process.stderr.write(`Unknown command "${command}"\n\n${USAGE}`)
  return EXIT.usage
}

async function runCapture(args) {
  const url = args.positional[0]
  if (!url) {
    process.stderr.write(`capture requires a url\n\n${USAGE}`)
    return EXIT.usage
  }

  let artefact
  try {
    artefact = await capture({
      url,
      timeoutMs: args.timeout ?? DEFAULTS.timeoutMs,
      settleMs: args.settle ?? DEFAULTS.settleMs,
      consent: args.consent ?? DEFAULTS.consent,
      routes: args.routes,
      dataLayerNames: [...DEFAULTS.dataLayerNames, ...args.dataLayerNames],
      viewport: args.viewport ?? DEFAULTS.viewport,
      headless: !args.headed,
    })
  } catch (error) {
    if (error instanceof NoBrowserError) {
      process.stderr.write(`${error.message}\n`)
      return EXIT.error
    }
    throw error
  }

  await emit(args.out, shape(artefact, args))
  if (!artefact.run.loaded) {
    process.stderr.write(`Page did not load: ${describe(artefact.errors)}\n`)
    return EXIT.error
  }
  if (artefact.run.timedOut) {
    process.stderr.write(`Capture hit its ${artefact.options.timeoutMs}ms budget; output is partial\n`)
  }
  return EXIT.ok
}

async function runReplay(args) {
  const path = args.positional[0]
  if (!path) {
    process.stderr.write(`replay requires an artefact path\n\n${USAGE}`)
    return EXIT.usage
  }
  try {
    const artefact = parseArtefact(await readFile(path, 'utf8'))
    await emit(args.out, shape(artefact, { ...args, raw: false }))
    return EXIT.ok
  } catch (error) {
    if (error instanceof ArtefactError) {
      process.stderr.write(`${error.message}\n`)
      return EXIT.error
    }
    throw error
  }
}

function shape(artefact, { raw, canonical }) {
  const shaped = raw ? artefact : normalise(artefact)
  return canonical ? canonicalise(shaped) : shaped
}

async function emit(out, value) {
  const text = `${stableStringify(value)}\n`
  if (out) await writeFile(out, text, 'utf8')
  else process.stdout.write(text)
}

function describe(errors) {
  return errors?.map((error) => error.message).join('; ') || 'no detail'
}

export function parseArgs(argv) {
  const args = {
    positional: [],
    routes: [],
    dataLayerNames: [],
    raw: false,
    canonical: false,
    headed: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const value = () => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${token} requires a value`)
      i += 1
      return next
    }
    switch (token) {
      case '--out':
        args.out = value()
        break
      case '--timeout':
        args.timeout = positiveInt(token, value())
        break
      case '--settle':
        args.settle = positiveInt(token, value())
        break
      case '--consent': {
        const consent = value()
        if (consent !== 'accept' && consent !== 'none') {
          throw new Error('--consent must be "accept" or "none"')
        }
        args.consent = consent
        break
      }
      case '--route':
        args.routes.push(value())
        break
      case '--datalayer-name':
        args.dataLayerNames.push(value())
        break
      case '--viewport':
        args.viewport = parseViewport(value())
        break
      case '--raw':
        args.raw = true
        break
      case '--canonical':
        args.canonical = true
        break
      case '--headed':
        args.headed = true
        break
      default:
        if (token.startsWith('--')) throw new Error(`Unknown option ${token}`)
        args.positional.push(token)
    }
  }
  return args
}

function positiveInt(flag, raw) {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`)
  return parsed
}

function parseViewport(raw) {
  const match = /^(\d+)x(\d+)$/.exec(raw)
  if (!match) throw new Error('--viewport must look like 1280x800')
  return { width: Number(match[1]), height: Number(match[2]) }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error?.stack ?? error}\n`)
      process.exit(EXIT.error)
    })
}
