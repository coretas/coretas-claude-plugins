import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
