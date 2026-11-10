import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

let server
let dom
let root
let AccountSection
let validateAccount
let calls
let client
let authChanged
let signedInUser
let createRoot

before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  ;({ AccountSection } = await server.ssrLoadModule('/src/components/AccountSection.tsx'))
  ;({ validateAccount } = await server.ssrLoadModule('/src/lib/account.ts'))
})

beforeEach(async () => {
  if (root) await act(() => root.unmount())
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById('root'))
  calls = []
  signedInUser = null
  client = {
    auth: {
      onAuthStateChange(callback) {
        authChanged = callback
        return { data: { subscription: { unsubscribe() {} } } }
      },
      async getUser() { return { data: { user: signedInUser } } },
      async signUp(input) { calls.push(['signup', input]); return { data: { session: null }, error: null } },
      async signInWithPassword(input) { calls.push(['login', input]); return { data: { user: signedInUser }, error: null } },
      async updateUser(input) {
        calls.push(['update', input])
        signedInUser = { ...signedInUser, user_metadata: { ...signedInUser?.user_metadata, ...input.data } }
        return { data: { user: signedInUser }, error: null }
      },
      async signOut() { calls.push(['logout']); authChanged('SIGNED_OUT', null); return { error: null } },
      async resetPasswordForEmail(email, options) { calls.push(['reset', email, options]); return { error: null } },
    },
  }
  await act(async () => root.render(React.createElement(AccountSection, { client })))
})

after(async () => {
  if (root) await act(() => root.unmount())
  await server?.close()
  dom?.window.close()
})

const button = (text) => [...document.querySelectorAll('button')].find((element) => element.textContent === text)
const click = async (element) => { await act(async () => element.click()) }
const submit = async () => {
  await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
}
async function fill(name, value) {
  const input = document.querySelector(`[name="${name}"]`)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(() => {
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('new passwords must match and be long enough, while existing short passwords can sign in', () => {
  const fields = { name: 'მარი', email: 'mari@example.com', password: 'short', confirmation: 'different' }
  assert.deepEqual(Object.keys(validateAccount('register', fields)), ['password', 'confirmation'])
  assert.deepEqual(validateAccount('login', fields), {})
  assert.deepEqual(validateAccount('reset', { ...fields, password: '' }), {})
  assert.deepEqual(validateAccount('new-password', { ...fields, password: 'long-enough', confirmation: 'long-enough' }), {})
})

test('invalid registration focuses the first error and never calls the provider', async () => {
  await submit()
  assert.equal(document.activeElement.name, 'name')
  assert.equal(document.querySelectorAll('[aria-invalid="true"]').length, 3)
  assert.equal(calls.length, 0)
  await fill('name', 'მარი')
  await fill('email', 'mari@example.com')
  await fill('password', 'long-enough')
  await fill('confirmation', 'different')
  await submit()
  assert.equal(document.activeElement.name, 'confirmation')
  assert.equal(calls.length, 0)
})

test('registration submits trimmed details and interests and shows email confirmation', async () => {
  await fill('name', '  მარი  ')
  await fill('email', ' mari@example.com ')
  await fill('password', 'long-enough')
  await fill('confirmation', 'long-enough')
  await click(document.querySelector('input[value="მთა"]'))
  await submit()
  assert.equal(calls[0][0], 'signup')
  assert.equal(calls[0][1].email, 'mari@example.com')
  assert.deepEqual(calls[0][1].options.data, { display_name: 'მარი', interests: ['მთა'] })
  assert.equal(calls[0][1].options.emailRedirectTo, 'http://localhost/#account')
  assert.match(document.querySelector('[role="status"]').textContent, /დადასტურების ბმულს/)
  assert.equal(document.querySelector('[name="password"]').value, '')
  assert.ok(document.querySelector('[name="email"]'), 'Confirmation does not manufacture a signed-in session')
})

test('unconfigured accounts report unavailable service without claiming a created account', async () => {
  await act(() => root.render(React.createElement(AccountSection, { client: null })))
  await fill('name', 'მარი')
  await fill('email', 'mari@example.com')
  await fill('password', 'long-enough')
  await fill('confirmation', 'long-enough')
  await submit()
  assert.match(document.querySelector('[role="alert"]').textContent, /სერვისი ჯერ მოსამზადებელია/)
  assert.equal(calls.length, 0)
  assert.equal(document.querySelector('[role="status"]'), null)
})

test('login reports invalid credentials and then accepts an existing short password', async () => {
  await click(button('შესვლა'))
  await fill('email', 'mari@example.com')
  await fill('password', 'old')
  client.auth.signInWithPassword = async () => ({ data: {}, error: { code: 'invalid_credentials' } })
  await submit()
  assert.match(document.querySelector('[role="alert"]').textContent, /ელფოსტა ან პაროლი არასწორია/)
  assert.ok(document.querySelector('[name="password"]'))
  signedInUser = { id: 'test-user', email: 'mari@example.com', user_metadata: { display_name: 'მარი' } }
  client.auth.signInWithPassword = async (input) => {
    calls.push(['login', input])
    return { data: { user: signedInUser }, error: null }
  }
  await submit()
  assert.deepEqual(calls[0], ['login', { email: 'mari@example.com', password: 'old' }])
  assert.equal(document.querySelector('[name="password"]'), null)
  assert.match(document.getElementById('account-title').textContent, /მარი/)
})

test('an existing session restores only recognized interests', async () => {
  await act(() => root.unmount())
  signedInUser = { id: 'test-user', email: 'mari@example.com', user_metadata: { interests: ['ზღვა', 'unknown'] } }
  root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(AccountSection, { client })))
  assert.equal(document.querySelector('input[value="ზღვა"]').checked, true)
  assert.equal(document.querySelectorAll('input:checked').length, 1)
  assert.equal(document.querySelector('[name="password"]'), null)
})

test('signed-in interests save on form submission and logout clears the profile', async () => {
  signedInUser = { id: 'test-user', email: 'mari@example.com', user_metadata: { display_name: 'მარი', interests: ['მთა'] } }
  await act(async () => authChanged('SIGNED_IN', { user: signedInUser }))
  await click(document.querySelector('input[value="ზღვა"]'))
  await act(async () => authChanged('TOKEN_REFRESHED', { user: { ...signedInUser, user_metadata: { ...signedInUser.user_metadata, interests: ['მთა'] } } }))
  assert.equal(document.querySelector('input[value="ზღვა"]').checked, true, 'Token refresh preserves unsaved interests')
  await submit()
  assert.deepEqual(calls[0], ['update', { data: { interests: ['მთა', 'ზღვა'] } }])
  await click(button(' ანგარიშიდან გასვლა'))
  assert.equal(document.querySelector('[name="email"]').value, '')
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0)
  assert.equal(document.querySelector('[name="password"]').value, '')
})

test('recovery email and recovery session use the password reset flow', async () => {
  await click(button('შესვლა'))
  await click(button('დაგავიწყდა პაროლი?'))
  await fill('email', 'mari@example.com')
  await submit()
  assert.equal(calls[0][0], 'reset')
  assert.match(document.querySelector('[role="status"]').textContent, /თუ ამ მისამართზე ანგარიში არსებობს/)
  signedInUser = { id: 'test-user', email: 'mari@example.com', user_metadata: {} }
  await act(async () => authChanged('PASSWORD_RECOVERY', { user: signedInUser }))
  await fill('password', 'brand-new-password')
  await fill('confirmation', 'brand-new-password')
  await submit()
  assert.deepEqual(calls[1], ['update', { password: 'brand-new-password' }])
})

test('provider failures stay on the form and repeated submission cannot duplicate a pending signup', async () => {
  let finishSignup
  client.auth.signUp = (input) => {
    calls.push(['signup', input])
    return new Promise((resolve) => { finishSignup = resolve })
  }
  await fill('name', 'მარი')
  await fill('email', 'mari@example.com')
  await fill('password', 'long-enough')
  await fill('confirmation', 'long-enough')
  await submit()
  await submit()
  assert.equal(calls.length, 1)
  await act(async () => finishSignup({ data: {}, error: { code: 'over_request_rate_limit' } }))
  assert.match(document.querySelector('[role="alert"]').textContent, /ლიმიტი/)
  assert.equal(document.querySelector('fieldset').disabled, false)
})
