import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import { createSettleTracker } from '../../lib/settle.mjs'

test('a quiet context settles', async () => {
  const settle = createSettleTracker(new EventEmitter())
  assert.equal(await settle.wait({ settleMs: 20, deadline: Date.now() + 2000 }), true)
  settle.dispose()
})

test('a request in flight holds settling off until it finishes', async () => {
  const context = new EventEmitter()
  const settle = createSettleTracker(context)

  context.emit('request')
  assert.equal(settle.inflight, 1)
  const pending = settle.wait({ settleMs: 20, deadline: Date.now() + 2000 })
  context.emit('requestfinished')
  assert.equal(settle.inflight, 0)

  assert.equal(await pending, true)
  settle.dispose()
})

test('a failed request still decrements the in-flight count', async () => {
  const context = new EventEmitter()
  const settle = createSettleTracker(context)
  context.emit('request')
  context.emit('requestfailed')
  assert.equal(settle.inflight, 0)
  assert.equal(await settle.wait({ settleMs: 20, deadline: Date.now() + 2000 }), true)
  settle.dispose()
})

test('a page that never goes quiet returns false at the deadline, not a throw', async () => {
  const context = new EventEmitter()
  const settle = createSettleTracker(context)
  const beat = setInterval(() => context.emit('request'), 5)

  const settled = await settle.wait({ settleMs: 200, deadline: Date.now() + 120 })

  clearInterval(beat)
  assert.equal(settled, false, 'the deadline must win over an endless heartbeat')
  settle.dispose()
})

test('an already-passed deadline returns false immediately', async () => {
  const settle = createSettleTracker(new EventEmitter())
  assert.equal(await settle.wait({ settleMs: 10, deadline: Date.now() - 1 }), false)
  settle.dispose()
})

test('dispose detaches the listeners so a closed context stops counting', async () => {
  const context = new EventEmitter()
  const settle = createSettleTracker(context)
  settle.dispose()
  assert.equal(context.listenerCount('request'), 0)
  assert.equal(context.listenerCount('requestfinished'), 0)
  assert.equal(context.listenerCount('requestfailed'), 0)
})
