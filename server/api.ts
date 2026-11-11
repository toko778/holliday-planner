import { normalizeTrip, validateTrip } from '../src/lib/trip'
import type { Trip, TripInput, TripResult } from '../src/lib/trip'
import { generateRecommendation, loadWeather } from './recommendation'
import { ApiError } from './types'
import type { Environment, Fetcher } from './types'

type Row = { id: string; owner_id: string; input_json: string; result_json: string | null; status: Trip['status']; revision: number; created_at: string; updated_at: string }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const fromRow = (row: Row): Trip => ({ id: row.id, input: JSON.parse(row.input_json), result: row.result_json ? JSON.parse(row.result_json) : null, status: row.status, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at })
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'მოთხოვნა JSON ფორმატში უნდა იყოს.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'მოთხოვნის მონაცემები აკლია.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); throw new ApiError(413, 'მოთხოვნა ზედმეტად დიდია.') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object')
    return value as Record<string, unknown>
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'მოთხოვნის მონაცემები არასწორია.') }
}

async function identify(request: Request, env: Environment, fetcher: Fetcher) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new ApiError(503, 'ანგარიშების სერვისი დროებით მიუწვდომელია.')
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || authorization.length > 6000) throw new ApiError(401, 'გეგმის შესაქმნელად შედი შენს ანგარიშში.')
  let response: Response
  try {
    response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10000) })
  } catch { throw new ApiError(503, 'სესიის გადამოწმება ვერ დასრულდა. სცადე მოგვიანებით.') }
  if (response.status >= 500 || response.status === 429) throw new ApiError(503, 'ანგარიშების სერვისი დროებით მიუწვდომელია.')
  if (!response.ok) throw new ApiError(401, 'სესია დასრულდა. ხელახლა შედი ანგარიშში.')
  const user = await response.json() as { id?: string }
  if (!uuid(user.id)) throw new ApiError(401, 'სესია ვერ გადამოწმდა. ხელახლა შედი ანგარიშში.')
  return user.id
}

export async function handleApi(request: Request, env: Environment, dependencies: { fetcher?: Fetcher; now?: () => Date } = {}) {
  const fetcher = dependencies.fetcher ?? fetch
  const now = dependencies.now ?? (() => new Date())
  try {
    const url = new URL(request.url)
    if (url.pathname === '/api/config' && request.method === 'GET') return json({ aiConfigured: Boolean(env.GROQ_API_KEY), storageConfigured: Boolean(env.DB) })
    if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) throw new ApiError(403, 'მოთხოვნის წყარო დაუშვებელია.')
    const ownerId = await identify(request, env, fetcher)
    if (!env.DB) throw new ApiError(503, 'გეგმების შენახვა დროებით მიუწვდომელია. სცადე მოგვიანებით.')

    if (url.pathname === '/api/trips' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM trips WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50').bind(ownerId).all<Row>()
      return json({ trips: results.map(fromRow) })
    }
    if (url.pathname === '/api/trips' && request.method === 'POST') {
      const body = await readBody(request)
      const errors = validateTrip(body.input, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(now()))
      if (Object.keys(errors).length) throw new ApiError(400, 'გადაამოწმე მონიშნული ველები.', errors)
      const input = normalizeTrip(body.input as TripInput)
      const inputJson = JSON.stringify(input)
      const timestamp = now().toISOString()
      const id = body.id ?? crypto.randomUUID()
      if (!uuid(id)) throw new ApiError(400, 'გეგმის იდენტიფიკატორი არასწორია.')
      const existing = await env.DB.prepare('SELECT * FROM trips WHERE id = ? AND owner_id = ?').bind(id, ownerId).first<Row>()
      if (body.id && !existing) throw new ApiError(404, 'გეგმა ვერ მოიძებნა.')
      if (existing) {
        if (body.revision !== existing.revision) throw new ApiError(409, 'გეგმა სხვა ფანჯარაში შეიცვალა. გახსენი შენახული ვერსია და სცადე ხელახლა.')
        if (existing.input_json !== inputJson) {
          const updated = await env.DB.prepare("UPDATE trips SET input_json = ?, result_json = NULL, status = 'draft', revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?").bind(inputJson, timestamp, id, ownerId, existing.revision).run()
          if (!updated.meta.changes) throw new ApiError(409, 'გეგმა შეიცვალა. გახსენი შენახული ვერსია.')
        }
      } else {
        const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM trips WHERE owner_id = ?').bind(ownerId).first<{ count: number }>()
        if ((count?.count ?? 0) >= 100) throw new ApiError(409, 'შენახულია 100 გეგმა. ახლის დამატებამდე წაშალე არასაჭირო გეგმა.')
        await env.DB.prepare('INSERT INTO trips (id, owner_id, input_json, revision, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)').bind(id, ownerId, inputJson, 'draft', timestamp, timestamp).run()
      }
      const saved = await env.DB.prepare('SELECT * FROM trips WHERE id = ? AND owner_id = ?').bind(id, ownerId).first<Row>()
      return json({ trip: fromRow(saved!) }, existing ? 200 : 201)
    }

    const match = url.pathname.match(/^\/api\/trips\/([0-9a-f-]{36})(\/generate)?$/i)
    if (!match) throw new ApiError(404, 'მოთხოვნა ვერ მოიძებნა.')
    const row = await env.DB.prepare('SELECT * FROM trips WHERE id = ? AND owner_id = ?').bind(match[1], ownerId).first<Row>()
    if (!row) throw new ApiError(404, 'გეგმა ვერ მოიძებნა.')

    if (!match[2] && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM trips WHERE id = ? AND owner_id = ?').bind(row.id, ownerId).run()
      return json({ deleted: true })
    }
    if (!match[2] && request.method === 'PATCH') {
      const body = await readBody(request)
      if (!['draft', 'planned', 'completed'].includes(body.status as string)) throw new ApiError(400, 'გეგმის სტატუსი არასწორია.')
      if (body.revision !== row.revision) throw new ApiError(409, 'გეგმა შეიცვალა. გახსენი შენახული ვერსია.')
      const updated = await env.DB.prepare('UPDATE trips SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?').bind(body.status, now().toISOString(), row.id, ownerId, row.revision).run()
      if (!updated.meta.changes) throw new ApiError(409, 'გეგმა შეიცვალა. გახსენი შენახული ვერსია.')
      return json({ trip: fromRow({ ...row, status: body.status as Trip['status'], revision: row.revision + 1, updated_at: now().toISOString() }) })
    }
    if (match[2] && request.method === 'POST') {
      if (!env.GROQ_API_KEY) throw new ApiError(503, 'AI სერვისი დროებით მიუწვდომელია. მონახაზი შენახულია.')
      const body = await readBody(request)
      if (!uuid(body.requestId)) throw new ApiError(400, 'მოთხოვნის იდენტიფიკატორი არასწორია.')
      if (body.revision !== row.revision) throw new ApiError(409, 'გეგმა შეიცვალა. გახსენი შენახული ვერსია.')
      const input = JSON.parse(row.input_json) as TripInput
      const errors = validateTrip(input, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(now()))
      if (Object.keys(errors).length) throw new ApiError(400, 'განაახლე გეგმის თარიღები.', errors)
      const previous = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ? AND owner_id = ?').bind(body.requestId, ownerId).first<{ trip_id: string; revision: number; status: string }>()
      if (previous) {
        if (previous.trip_id === row.id && previous.revision === row.revision && previous.status === 'complete' && row.result_json) return json({ trip: fromRow(row) })
        throw new ApiError(409, 'ეს მოთხოვნა უკვე დამუშავებულია ან ჯერ მიმდინარეობს. სცადე ცოტა მოგვიანებით.')
      }
      const timestamp = now().getTime()
      const allowed = await env.DB.prepare(`INSERT INTO ai_requests (id, owner_id, trip_id, revision, started_at, status)
        SELECT ?, ?, ?, ?, ?, 'pending'
        WHERE (SELECT COUNT(*) FROM ai_requests WHERE owner_id = ? AND started_at > ?) < 10
        AND (SELECT COUNT(*) FROM ai_requests WHERE owner_id = ? AND started_at > ?) = 0
        AND (SELECT COUNT(*) FROM ai_requests WHERE started_at > ?) < 100
        ON CONFLICT(id) DO NOTHING`).bind(body.requestId, ownerId, row.id, row.revision, timestamp, ownerId, timestamp - 86400000, ownerId, timestamp - 20000, timestamp - 86400000).run()
      if (!allowed.meta.changes) throw new ApiError(429, 'მოთხოვნები დროებით შეზღუდულია. დაელოდე სულ მცირე 20 წამს; თითო ანგარიშზე დღეში 10 AI გეგმაა ხელმისაწვდომი.')
      try {
        const weather = await loadWeather(input, fetcher, now())
        const recommendation = await generateRecommendation(input, weather, env, fetcher)
        const result: TripResult = { recommendation, weather, model: env.GROQ_MODEL || 'qwen/qwen3.8-27b', generatedAt: now().toISOString() }
        const updated = await env.DB.prepare('UPDATE trips SET result_json = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?').bind(JSON.stringify(result), now().toISOString(), row.id, ownerId, row.revision).run()
        if (!updated.meta.changes) throw new ApiError(409, 'გეგმა გენერაციის დროს შეიცვალა ან წაიშალა. განახლებული ვერსიისთვის ხელახლა მოამზადე რჩევა.')
        await env.DB.prepare("UPDATE ai_requests SET status = 'complete' WHERE id = ? AND owner_id = ?").bind(body.requestId, ownerId).run()
        return json({ trip: fromRow({ ...row, result_json: JSON.stringify(result), updated_at: now().toISOString() }) })
      } catch (error) {
        await env.DB.prepare("UPDATE ai_requests SET status = 'failed' WHERE id = ? AND owner_id = ?").bind(body.requestId, ownerId).run()
        throw error
      }
    }
    throw new ApiError(405, 'ეს მოქმედება დაუშვებელია.')
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, fields: error.fields }, error.status)
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return json({ error: 'სერვისს პასუხი დააგვიანდა. მონახაზი შენახულია; სცადე ხელახლა.' }, 504)
    return json({ error: 'მოთხოვნა ვერ დასრულდა. შენახული გეგმები შენარჩუნებულია; სცადე ხელახლა.' }, 500)
  }
}
