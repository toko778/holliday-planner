import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

let server
let dom
let root
let Navigation
let App
let breakpointChanged

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = () => ({
    matches: false,
    addEventListener: (_, handler) => { breakpointChanged = handler },
    removeEventListener: () => {},
  })
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  ;({ Navigation } = await server.ssrLoadModule('/src/components/Navigation.tsx'))
  ;({ default: App } = await server.ssrLoadModule('/src/App.tsx'))
})

beforeEach(async () => {
  if (root) await act(() => root.unmount())
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById('root'))
  await act(() => root.render(React.createElement(Navigation)))
})

after(async () => {
  if (root) await act(() => root.unmount())
  await server?.close()
  dom?.window.close()
})

const mobileButton = () => document.querySelector('[aria-controls="main-navigation"]')
const guideButton = () => document.querySelector('[aria-controls="guide-links"]')
const guideLinks = () => document.getElementById('guide-links')
const click = async (element) => { await act(() => element.click()) }
const escape = async () => { await act(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))) }

test('mobile navigation updates its accessible state and closes after following a link', async () => {
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
  await click(mobileButton())
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'true')
  assert.equal(mobileButton().getAttribute('aria-label'), 'მენიუს დახურვა')
  await click(document.querySelector('nav a[href="#destinations"]'))
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
})

test('Escape closes the dropdown first, then mobile navigation, restoring trigger focus', async () => {
  await click(mobileButton())
  await click(guideButton())
  assert.equal(guideLinks().hidden, false)
  await escape()
  assert.equal(guideLinks().hidden, true)
  assert.equal(document.activeElement, guideButton())
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'true')
  await escape()
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, mobileButton())
})

test('outside pointer interaction closes both disclosures', async () => {
  await click(mobileButton())
  await click(guideButton())
  await act(() => document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })))
  assert.equal(guideLinks().hidden, true)
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
})

test('moving focus out of the navigation closes it', async () => {
  await click(mobileButton())
  await click(guideButton())
  await act(() => guideButton().focus())
  const outside = document.createElement('button')
  document.body.append(outside)
  await act(() => outside.focus())
  assert.equal(guideLinks().hidden, true)
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
})

test('changing between mobile and desktop resets open disclosure state', async () => {
  await click(mobileButton())
  await click(guideButton())
  await act(() => breakpointChanged())
  assert.equal(guideLinks().hidden, true)
  assert.equal(mobileButton().getAttribute('aria-expanded'), 'false')
})

test('homepage has three destinations and every section link has a real target', async () => {
  await act(() => root.render(React.createElement(App)))
  assert.equal(document.querySelectorAll('h1').length, 1)
  assert.equal(document.querySelectorAll('.destination-card').length, 3)
  assert.equal(document.querySelectorAll('details').length, 3)
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(link.getAttribute('href').slice(1)), `Missing target: ${link.getAttribute('href')}`)
  }
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
  assert.equal(new Set(ids).size, ids.length, 'Every SVG and disclosure ID must be unique')
  assert.ok(document.getElementById('planner'), 'Homepage includes the working planner')
})
