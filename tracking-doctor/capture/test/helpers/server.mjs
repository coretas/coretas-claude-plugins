import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

/**
 * Fixture server bound to 127.0.0.1. Tests never reach the internet: every
 * tracking endpoint the fixtures hit is served here and answers 204, the way a
 * real collect endpoint does.
 */
export async function startFixtureServer() {
  const hits = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    hits.push({ method: req.method, path: url.pathname })

    if (url.pathname.startsWith('/collect/')) {
      res.writeHead(204, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (url.pathname.startsWith('/spa/')) {
      await sendFixture(res, 'spa.html')
      return
    }
    if (url.pathname === '/pixel.gif') {
      res.writeHead(200, { 'content-type': 'image/gif' })
      res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'))
      return
    }
    const name = normalize(url.pathname).replace(/^[/\\]+/, '') || 'index.html'
    await sendFixture(res, name)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    url: (path) => `http://127.0.0.1:${port}${path}`,
    async close() {
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

async function sendFixture(res, name) {
  try {
    const body = await readFile(join(FIXTURES, name))
    res.writeHead(200, { 'content-type': contentType(name), 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
}

function contentType(name) {
  if (name.endsWith('.html')) return 'text/html; charset=utf-8'
  if (name.endsWith('.js')) return 'text/javascript; charset=utf-8'
  return 'application/octet-stream'
}
