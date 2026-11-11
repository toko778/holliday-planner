import { createServer } from 'node:http'
import { loadEnv } from 'vite'
import worker from '../dist/server/index.js'
import { openDatabase } from './local-database.mjs'

const config = loadEnv('production', process.cwd(), '')
const DB = openDatabase()
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []
    let size = 0
    for await (const chunk of incoming) { size += chunk.length; if (size > 8192) { outgoing.writeHead(413); outgoing.end(); return }; chunks.push(chunk) }
    const method = incoming.method ?? 'GET'
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}) })
    const response = await worker.fetch(request, { DB, GROQ_API_KEY: config.GROQ_API_KEY, GROQ_MODEL: config.GROQ_MODEL, SUPABASE_URL: config.VITE_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: config.VITE_SUPABASE_PUBLISHABLE_KEY })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch { outgoing.writeHead(500); outgoing.end('Preview request failed') }
})
server.listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173/'))
process.on('SIGINT', () => server.close(() => { DB.close(); process.exit() }))
