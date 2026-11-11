import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

let server, dom, root, createRoot, PlannerSection, emptyTripInput, input, calls, user, authChanged, api, saved, result
const owner = '10000000-0000-4000-8000-000000000001'
const click = async (element) => { assert.ok(element); await act(async () => element.click()) }
const button = (text) => [...document.querySelectorAll('button')].find((element) => element.textContent.includes(text))
async function fill(name, value) {
  const field = document.querySelector(`[name="${name}"]`)
  await act(async () => {
    const prototype = field instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value)
    field.dispatchEvent(new window.Event('input', { bubbles: true }))
    field.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}
const submit = async () => { await act(async () => document.querySelector('.trip-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))) }

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  globalThis.requestAnimationFrame = (callback) => { callback(); return 0 }
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  ;({ PlannerSection } = await server.ssrLoadModule('/src/components/PlannerSection.tsx'))
  ;({ emptyTripInput } = await server.ssrLoadModule('/src/lib/trip.ts'))
})

beforeEach(async () => {
  if (root) await act(() => root.unmount())
  document.body.innerHTML = '<div id="root"></div>'
  input = emptyTripInput(); calls = []; user = { id: owner, user_metadata: {} }
  result = { model: 'test-model', generatedAt: new Date().toISOString(), weather: { status: 'unavailable', days: [], fetchedAt: new Date().toISOString(), note: 'პროგნოზი უცნობია.' }, recommendation: { title: 'მშვიდი მოგზაურობა', summary: 'დასვენება შენს ადამიანებთან.', days: [1, 2].map((day) => ({ day, title: 'სეირნობა', morning: 'გასვლა', afternoon: 'დასვენება', evening: 'დაბრუნება' })), packing: ['წყალი'], tips: ['შეამოწმე პირობები'], alternatives: [], budgetAdvice: 'დაიცავი მითითებული ბიუჯეტი.' } }
  saved = { id: crypto.randomUUID(), input, revision: 1, status: 'draft', result: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  api = async (path, method = 'GET', data) => {
    calls.push({ path, method, data })
    if (method === 'GET') return { trips: [] }
    if (method === 'POST' && path === '/api/trips') { saved = { ...saved, input: data.input }; return { trip: saved } }
    if (path.endsWith('/generate')) { saved = { ...saved, result }; return { trip: saved } }
    if (method === 'PATCH') { saved = { ...saved, status: data.status }; return { trip: saved } }
    return { deleted: true }
  }
  root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(PlannerSection, {
    client: { auth: { getUser: async () => ({ data: { user } }), onAuthStateChange: (callback) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } } } } },
    requestApi: (...args) => api(...args),
  })))
})
after(async () => { if (root) await act(() => root.unmount()); await server?.close(); dom?.window.close() })

test('invalid planner fields focus the first error and make no write requests', async () => {
  await fill('departure', '')
  await submit()
  assert.equal(document.activeElement.name, 'departure')
  assert.ok(document.getElementById('trip-error-departure'))
  assert.equal(calls.filter((call) => call.method !== 'GET').length, 0)
})

test('saving a draft makes it available in My Plans without generating AI', async () => {
  await click(button('მონახაზის შენახვა'))
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  await click(button('ჩემი გეგმები'))
  assert.equal(document.querySelectorAll('.saved-plan-card').length, 1)
  assert.equal(document.querySelector('.saved-plan-card h3').textContent, 'ბაკურიანი')
})

test('generation saves first, renders the result and hides it as soon as inputs change', async () => {
  await submit()
  assert.equal(calls.filter((call) => call.method === 'POST').length, 2)
  assert.equal(document.getElementById('trip-result-title').textContent, 'მშვიდი მოგზაურობა')
  assert.equal(document.querySelectorAll('.itinerary-day').length, 2)
  await fill('people', '3')
  assert.equal(document.getElementById('trip-result-title'), null)
  assert.match(document.querySelector('.planner-notice').textContent, /პირობები შეიცვალა/)
})

test('provider failure keeps the saved draft and user input available for retry', async () => {
  const original = api
  api = (path, method, data) => path.endsWith('/generate') ? Promise.reject(new Error('ლიმიტი ამოიწურა. მონახაზი შენახულია.')) : original(path, method, data)
  await submit()
  assert.match(document.querySelector('[role="alert"]').textContent, /მონახაზი შენახულია/)
  await click(button('ჩემი გეგმები'))
  assert.equal(document.querySelectorAll('.saved-plan-card').length, 1)
})

test('logging out removes private results and saved plans from the page', async () => {
  await submit()
  assert.ok(document.getElementById('trip-result-title'))
  await act(async () => authChanged('SIGNED_OUT', null))
  assert.equal(document.getElementById('trip-result-title'), null)
  await click(button('ჩემი გეგმები'))
  assert.equal(document.querySelectorAll('.saved-plan-card').length, 0)
})

test('a late generation response after sign-out cannot restore the old user plan', async () => {
  let complete
  const original = api
  api = (path, method, data) => path.endsWith('/generate') ? new Promise((resolve) => { complete = resolve }) : original(path, method, data)
  await submit()
  assert.ok(complete)
  await act(async () => authChanged('SIGNED_OUT', null))
  await act(async () => complete({ trip: { ...saved, result } }))
  assert.equal(document.getElementById('trip-result-title'), null)
  await click(button('ჩემი გეგმები'))
  assert.equal(document.querySelectorAll('.saved-plan-card').length, 0)
})
