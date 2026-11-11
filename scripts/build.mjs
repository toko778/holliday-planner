import { build } from 'vite'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'

const projectRoot = realpathSync(process.cwd())
const output = path.resolve(projectRoot, 'dist')
if (path.dirname(output) !== projectRoot || path.basename(output) !== 'dist' || lstatSync(output, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Build output must be the project dist directory')
rmSync(output, { recursive: true, force: true })
await build({ build: { outDir: 'dist/client', emptyOutDir: true } })
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' }
const assets = {}
function collect(directory, relative = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name)
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(filename, name)
    else if (entry.isFile()) assets[`/${name}`] = { data: readFileSync(filename).toString('base64'), type: types[path.extname(name)] || 'application/octet-stream' }
  }
}
collect('dist/client')
mkdirSync('runtime-data', { recursive: true })
writeFileSync('runtime-data/client-assets.ts', `export default ${JSON.stringify(assets)} as Record<string, { data: string; type: string }>\n`)
await build({ configFile: false, publicDir: false, build: { ssr: 'worker/index.ts', outDir: 'dist/server', emptyOutDir: true, target: 'es2022', sourcemap: false, rolldownOptions: { output: { entryFileNames: 'index.js' } } } })
mkdirSync('dist/.openai', { recursive: true })
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json')
console.log('Worker built with embedded client assets; no API secrets are embedded.')
