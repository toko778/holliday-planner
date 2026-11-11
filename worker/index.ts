import assets from '../runtime-data/client-assets'
import { handleApi } from '../server/api'
import type { Environment } from '../server/types'

const decoded = new Map<string, Uint8Array>()
export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (pathname.startsWith('/api/')) return handleApi(request, env)
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
    const name = pathname === '/' ? '/index.html' : pathname
    const asset = assets[name]
    if (!asset) return new Response('Page not found', { status: 404 })
    if (!decoded.has(name)) decoded.set(name, Uint8Array.from(atob(asset.data), (character) => character.charCodeAt(0)))
    return new Response(request.method === 'HEAD' ? null : decoded.get(name), { headers: { 'Content-Type': asset.type, 'Cache-Control': name.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } })
  },
}
