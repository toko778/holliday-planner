import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'

// Receive the API key through hidden stdin. Never print it or persist it.
const key = await new Promise((resolve, reject) => {
  let input = ''
  const terminal = process.stdin.isTTY
  if (terminal) { process.stdin.setRawMode(true); process.stderr.write('Ready for secret JSON on stdin (input is hidden).\n') }
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', function read(chunk) {
    input += chunk
    if (input.includes('\u0003')) reject(new Error('Cancelled'))
    if (!/[\r\n]/.test(input)) return
    process.stdin.removeListener('data', read)
    if (terminal) process.stdin.setRawMode(false)
    process.stdin.pause()
    try { resolve(JSON.parse(input).key) } catch { reject(new Error('Invalid secret input')) }
  })
  process.stdin.resume()
})
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
const model = process.argv[2] || 'qwen/qwen3.8-27b'
try {
  const { emptyTripInput } = await server.ssrLoadModule('/src/lib/trip.ts')
  const { loadWeather, generateRecommendation } = await server.ssrLoadModule('/server/recommendation.ts')
  const input = emptyTripInput()
  const weather = await loadWeather(input, fetch, new Date())
  const probeFetch = async (...args) => {
    const response = await fetch(...args)
    if (String(args[0]).includes('api.groq.com')) {
      const body = await response.clone().json()
      writeFileSync('runtime-data/service-probe.json', JSON.stringify({ status: response.status, choices: body.choices, usage: body.usage }, null, 2))
    }
    return response
  }
  const recommendation = await generateRecommendation(input, weather, { GROQ_API_KEY: key, GROQ_MODEL: model }, probeFetch)
  const result = { checkedAt: new Date().toISOString(), model, input, weather, recommendation, checks: { liveGroqRequest: true, georgianResponse: /[ა-ჰ]/.test(recommendation.summary), correctDayCount: recommendation.days.length === 2, weatherStatus: weather.status } }
  writeFileSync('evidence/P2.9-groq-live.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ ...result.checks, title: recommendation.title }))
} catch (error) {
  console.error(JSON.stringify({ liveCheckPassed: false, message: error instanceof Error ? error.message : 'Service request failed' }))
  process.exitCode = 1
} finally { await server.close() }
