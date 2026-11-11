import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { openDatabase } from '../scripts/local-database.mjs'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const referenceTime = new Date('2026-11-11T10:00:00Z')
const input = { destination: 'bakuriani', departure: 'თბილისი', startDate: '2026-11-13', endDate: '2026-11-14', people: 2, budget: 300, budgetUnit: 'person', transport: 'car', interests: ['სიმშვიდე'], notes: '' }
const recommendation = { title: 'მშვიდი დასვენება ბაკურიანში', summary: 'ორი დღე ბუნებასა და მეგობრებთან ერთად.', days: [1, 2].map((day) => ({ day, title: 'დასვენების დღე', morning: 'მშვიდი სეირნობა.', afternoon: 'ადგილობრივი გარემოს გაცნობა.', evening: 'დასვენება.' })), packing: ['თბილი ტანსაცმელი'], tips: ['გადაამოწმე ამინდი.'], alternatives: [{ destination: 'batumi', reason: 'სანაპიროზე სეირნობა.' }], budgetAdvice: 'დაგეგმე ხარჯები მითითებული ლიმიტების ფარგლებში.' }
let server, handleApi, validateTrip, budgetBreakdown, loadWeather, DB, env, fetcher, calls

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  ;({ handleApi } = await server.ssrLoadModule('/server/api.ts'))
  ;({ validateTrip, budgetBreakdown } = await server.ssrLoadModule('/src/lib/trip.ts'))
  ;({ loadWeather } = await server.ssrLoadModule('/server/recommendation.ts'))
})
beforeEach(() => {
  DB?.close()
  DB = openDatabase(':memory:')
  env = { DB, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test', GROQ_API_KEY: 'test-only-key', GROQ_MODEL: 'model-for-test' }
  calls = []
  fetcher = async (url, options = {}) => {
    calls.push([String(url), options])
    if (String(url).endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization
      return token === 'Bearer invalid' ? Response.json({}, { status: 401 }) : Response.json({ id: token === 'Bearer other' ? other : owner })
    }
    if (String(url).includes('geocoding-api.')) return Response.json({ results: [{ country_code: 'GE', latitude: 41.75, longitude: 43.53 }] })
    if (String(url).includes('api.open-meteo.')) return Response.json({ daily: { time: ['2026-11-13', '2026-11-14'], temperature_2m_min: [2, 3], temperature_2m_max: [9, 10], precipitation_probability_max: [10, 20] } })
    if (String(url).includes('api.groq.')) return Response.json({ choices: [{ message: { content: JSON.stringify(recommendation) } }] })
    throw new Error('Unexpected external request')
  }
})
after(async () => { DB?.close(); await server?.close() })

async function request(path, method = 'GET', data, token = 'owner', headers = {}) {
  return handleApi(new Request(`https://planner.test${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), env, { fetcher, now: () => referenceTime })
}
async function create(overrides = {}) {
  const response = await request('/api/trips', 'POST', { input: { ...input, ...overrides } })
  assert.equal(response.status, 201)
  return (await response.json()).trip
}
const generate = (trip, requestId = crypto.randomUUID()) => request(`/api/trips/${trip.id}/generate`, 'POST', { revision: trip.revision, requestId })

test('trip validation rejects ambiguous dates, inverted ranges, overlong trips and invalid money or people', () => {
  assert.deepEqual(validateTrip(input, '2026-11-11'), {})
  for (const startDate of ['2026-02-30', '2026-2-3', '2026-11-10']) assert.ok(validateTrip({ ...input, startDate }, '2026-11-11').startDate)
  assert.ok(validateTrip({ ...input, endDate: '2026-11-12' }, '2026-11-11').endDate)
  assert.ok(validateTrip({ ...input, endDate: '2026-11-20' }, '2026-11-11').endDate)
  assert.ok(validateTrip({ ...input, people: 1.5, budget: Infinity }, '2026-11-11').people)
  assert.ok(validateTrip({ ...input, budget: 0.001 }, '2026-11-11').budget)
})

test('budget allocation distinguishes whole-group and per-person totals and excludes accommodation on day trips', () => {
  assert.equal(budgetBreakdown(input).total, 600)
  assert.equal(budgetBreakdown({ ...input, budgetUnit: 'group' }).total, 300)
  const oneDay = budgetBreakdown({ ...input, budget: 300.01, endDate: input.startDate })
  assert.equal(oneDay.nights, 0)
  assert.equal(oneDay.categories[0].amount, 0)
  assert.equal(Math.round(oneDay.categories.reduce((sum, category) => sum + category.amount, 0) * 100), 60002)
})

test('anonymous and invalid sessions cannot create or read plans', async () => {
  assert.equal((await request('/api/trips', 'GET', undefined, '')).status, 401)
  assert.equal((await request('/api/trips', 'POST', { input }, 'invalid')).status, 401)
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM trips').first()).count, 0)
})

test('cross-origin writes and oversized JSON are rejected', async () => {
  assert.equal((await request('/api/trips', 'POST', { input }, 'owner', { Origin: 'https://other.test' })).status, 403)
  assert.equal((await request('/api/trips', 'POST', { input, padding: 'x'.repeat(9000) })).status, 413)
})

test('saved trips survive a second API call and are invisible to other owners for every operation', async () => {
  const trip = await create()
  const ownList = await (await request('/api/trips')).json()
  assert.equal(ownList.trips[0].id, trip.id)
  assert.deepEqual((await (await request('/api/trips', 'GET', undefined, 'other')).json()).trips, [])
  for (const [method, suffix, body] of [['DELETE', '', undefined], ['PATCH', '', { status: 'planned', revision: 1 }], ['POST', '/generate', { revision: 1, requestId: crypto.randomUUID() }]]) {
    assert.equal((await request(`/api/trips/${trip.id}${suffix}`, method, body, 'other')).status, 404)
  }
  assert.equal((await request('/api/trips', 'POST', { id: trip.id, revision: 1, input }, 'other')).status, 404)
})

test('real generation path validates and saves the result, uses a server key and sends no account contacts', async () => {
  const trip = await create()
  const response = await generate(trip)
  assert.equal(response.status, 200)
  const saved = (await response.json()).trip
  assert.equal(saved.result.recommendation.summary, recommendation.summary)
  assert.equal(saved.result.weather.status, 'forecast')
  const groq = calls.find(([url]) => url.includes('api.groq.'))
  assert.equal(groq[1].headers.Authorization, 'Bearer test-only-key')
  const body = JSON.parse(groq[1].body)
  assert.equal(body.response_format.json_schema.strict, true)
  assert.ok(!groq[1].body.includes(owner), 'Do not forward account IDs')
  assert.equal((await (await request('/api/trips')).json()).trips[0].result.model, 'model-for-test')
})

test('replayed request IDs are idempotent and repeated new requests are limited by persistent database state', async () => {
  const trip = await create()
  const id = crypto.randomUUID()
  assert.equal((await generate(trip, id)).status, 200)
  assert.equal((await generate(trip, id)).status, 200)
  assert.equal(calls.filter(([url]) => url.includes('api.groq.')).length, 1)
  assert.equal((await generate(trip)).status, 429)
})

test('provider rate limits preserve the draft and never create a fake recommendation', async () => {
  const original = fetcher
  fetcher = (url, options) => String(url).includes('api.groq.') ? Promise.resolve(Response.json({}, { status: 429 })) : original(url, options)
  const trip = await create()
  assert.equal((await generate(trip)).status, 429)
  const listed = (await (await request('/api/trips')).json()).trips[0]
  assert.equal(listed.result, null)
  assert.equal(listed.id, trip.id)
})

test('malformed AI output is rejected rather than saved as a result', async () => {
  const original = fetcher
  fetcher = (url, options) => String(url).includes('api.groq.') ? Promise.resolve(Response.json({ choices: [{ message: { content: '{bad-json' } }] })) : original(url, options)
  const trip = await create()
  assert.equal((await generate(trip)).status, 502)
  assert.equal((await DB.prepare('SELECT result_json FROM trips WHERE id = ?').bind(trip.id).first()).result_json, null)
})

test('editing inputs clears the old recommendation and stale revisions cannot overwrite a plan', async () => {
  const trip = await create()
  const generated = (await (await generate(trip)).json()).trip
  assert.ok(generated.result)
  const updated = await request('/api/trips', 'POST', { id: trip.id, revision: trip.revision, input: { ...input, people: 3 } })
  assert.equal(updated.status, 200)
  const next = (await updated.json()).trip
  assert.equal(next.revision, 2)
  assert.equal(next.result, null)
  assert.equal((await request('/api/trips', 'POST', { id: trip.id, revision: 1, input })).status, 409)
})

test('an in-flight result cannot overwrite an edited trip', async () => {
  const trip = await create()
  const original = fetcher
  fetcher = async (url, options) => {
    if (String(url).includes('api.groq.')) {
      await DB.prepare('UPDATE trips SET revision = 2, input_json = ? WHERE id = ?').bind(JSON.stringify({ ...input, people: 4 }), trip.id).run()
    }
    return original(url, options)
  }
  assert.equal((await generate(trip)).status, 409)
  const row = await DB.prepare('SELECT * FROM trips WHERE id = ?').bind(trip.id).first()
  assert.equal(row.result_json, null)
  assert.equal(row.revision, 2)
})

test('future dates never get invented forecasts and partial forecast coverage is explicit', async () => {
  const far = await loadWeather({ ...input, startDate: '2026-12-15', endDate: '2026-12-16' }, fetcher, referenceTime)
  assert.equal(far.status, 'unavailable')
  assert.equal(calls.length, 0)
  const partial = await loadWeather({ ...input, endDate: '2026-11-15' }, fetcher, referenceTime)
  assert.equal(partial.status, 'partial')
  assert.equal(partial.days.length, 2)
})

test('status changes require an explicit owner action, and deletion removes only the selected owned record', async () => {
  const trip = await create()
  const status = await request(`/api/trips/${trip.id}`, 'PATCH', { status: 'planned', revision: 1 })
  assert.equal((await status.json()).trip.status, 'planned')
  assert.equal((await request(`/api/trips/${trip.id}`, 'DELETE')).status, 200)
  assert.equal((await (await request('/api/trips')).json()).trips.length, 0)
})
