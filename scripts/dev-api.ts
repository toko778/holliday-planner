import type { Plugin } from 'vite'
import type { Database } from '../server/types.ts'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function localApi(config: Record<string, string>): Plugin {
  return {
    name: 'holliday-local-api',
    async configureServer(server) {
      // Kept out of the browser and production Worker; local preview persists separately.
      const databaseModule = pathToFileURL(resolve('scripts/local-database.mjs')).href
      const { openDatabase } = await import(databaseModule) as { openDatabase: () => Database & { close(): void } }
      const DB = openDatabase()
      server.httpServer?.once('close', () => DB.close())
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (!incoming.url?.startsWith('/api/')) return next()
        try {
          const { handleApi } = await server.ssrLoadModule('/server/api.ts')
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of incoming) {
            size += chunk.length
            if (size > 8192) { outgoing.writeHead(413); outgoing.end('Request too large'); return }
            chunks.push(Buffer.from(chunk))
          }
          const method = incoming.method ?? 'GET'
          const headers = new Headers()
          for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value)
          const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { method, headers, ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}) })
          const response: Response = await handleApi(request, { DB, GROQ_API_KEY: config.GROQ_API_KEY, GROQ_MODEL: config.GROQ_MODEL, SUPABASE_URL: config.VITE_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: config.VITE_SUPABASE_PUBLISHABLE_KEY })
          outgoing.writeHead(response.status, Object.fromEntries(response.headers))
          outgoing.end(Buffer.from(await response.arrayBuffer()))
        } catch { outgoing.writeHead(500, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ error: 'ლოკალური სერვერის მოთხოვნა ვერ დასრულდა.' })) }
      })
    },
  }
}
