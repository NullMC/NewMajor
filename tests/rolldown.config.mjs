// Compila i test unitari (TypeScript con alias "@/") in un unico file eseguibile da Node.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export default {
  input: path.join(root, 'tests/patterns.test.ts'),
  platform: 'node',
  resolve: { alias: { '@': path.join(root, 'src') } },
  output: { file: path.join(root, 'node_modules/.cache/unit/patterns.test.mjs'), format: 'esm' },
  logLevel: 'warn',
}
