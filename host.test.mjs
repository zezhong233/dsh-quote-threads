import test from 'node:test'
import assert from 'node:assert/strict'
import { __testing } from './index.js'

function authorizationResult(trusted, headers = {}) {
  const req = {
    method: 'POST',
    headers: {
      'x-dsh-quote-threads': '1',
      host: '127.0.0.1:54321',
      origin: 'http://127.0.0.1:54321',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  }
  const res = {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.payload = JSON.parse(value) },
  }
  const ctx = {
    connection: {
      isTrusted: (request) => typeof trusted === 'function' ? trusted(request) : request === req && trusted,
    },
    webServer: { getOrigin: () => { throw new Error('fixed listener origin must not be consulted') } },
  }
  return { accepted: __testing.authorize(ctx, req, res), res }
}

const input = {
  source: {
    parentSessionId: 'parent-session',
    parentMessageId: 'assistant-message',
    parentTurn: 3,
    parentSeq: 42,
    start: 10,
    end: 24,
  },
  answer: '母回答的完整原文',
  quote: '需要解释的句子',
  question: '这句话为什么成立？',
}

test('authorization uses the deployment-aware Host and Origin trust fence', () => {
  const remote = authorizationResult(true)
  assert.equal(remote.accepted, true)
  assert.equal(remote.res.statusCode, 200)

  const rejected = authorizationResult(false)
  assert.equal(rejected.accepted, false)
  assert.equal(rejected.res.statusCode, 403)
  assert.equal(rejected.res.payload.error, 'cross-origin request rejected')
})

test('authorization accepts a same-origin proxy only when its Host remains trusted', () => {
  const proxied = authorizationResult((request) => request.headers.origin === undefined
    && request.headers.host === '127.0.0.1:13080'
    && request.headers['sec-fetch-site'] === 'same-origin', {
    host: '127.0.0.1:13080',
    origin: 'http://127.0.0.1:54321',
  })
  assert.equal(proxied.accepted, true)
  assert.equal(proxied.res.statusCode, 200)

  const crossSite = authorizationResult((request) => request.headers.origin === undefined, {
    'sec-fetch-site': 'cross-site',
  })
  assert.equal(crossSite.accepted, false)
  assert.equal(crossSite.res.statusCode, 403)

  const untrustedHost = authorizationResult(false)
  assert.equal(untrustedHost.accepted, false)
  assert.equal(untrustedHost.res.statusCode, 403)
})

test('authorization still requires the plugin request marker', () => {
  const missing = authorizationResult(true, { 'x-dsh-quote-threads': undefined })
  assert.equal(missing.accepted, false)
  assert.equal(missing.res.statusCode, 403)
  assert.equal(missing.res.payload.error, 'missing plugin request marker')
})

test('initial prompt preserves a versioned, recoverable quote record', () => {
  const prompt = __testing.formatInitialPrompt(input)
  const record = __testing.parseQuoteRecord(prompt)
  assert.equal(record.version, 1)
  assert.equal(record.source.parentSessionId, input.source.parentSessionId)
  assert.equal(record.source.parentMessageId, input.source.parentMessageId)
  assert.equal(record.source.parentTurn, 3)
  assert.equal(record.source.parentSeq, 42)
  assert.equal(record.source.start, 10)
  assert.equal(record.source.end, 24)
  assert.equal(record.quote, input.quote)
  assert.equal(record.question, input.question)
  assert.match(prompt, /<parent-answer>/)
  assert.match(prompt, /<quoted-text>/)
  assert.match(prompt, /<question>/)
})

test('quote discovery reads user/message data.content and honors inherited boundary', () => {
  const prompt = __testing.formatInitialPrompt(input)
  const events = [
    { seq: 0, type: 'user/message', data: { id: 'inherited', content: [{ type: 'text', text: prompt }] } },
    { seq: 1, type: 'user/message', data: { id: 'own', content: [{ type: 'text', text: prompt }] } },
  ]
  assert.equal(__testing.quoteFromEvents(events, 1).initialSeq, 1)
  assert.equal(__testing.quoteFromEvents(events, 1).record.source.parentMessageId, 'assistant-message')
})

test('ordinary messages and malformed markers are not quote threads', () => {
  assert.equal(__testing.parseQuoteRecord('普通用户消息'), undefined)
  assert.equal(__testing.parseQuoteRecord('[[DSH_QUOTE_THREAD_V1]]\n{bad json}\n[[/DSH_QUOTE_THREAD_V1]]'), undefined)
  assert.equal(__testing.quoteFromEvents([{ seq: 0, type: 'assistant/message', data: { message: { content: [] } } }]), undefined)
})

test('source validation rejects invalid coordinates and oversized input', () => {
  assert.throws(() => __testing.cleanCreateInput({ ...input, source: { ...input.source, parentTurn: -1 } }), /parentTurn/)
  assert.throws(() => __testing.cleanCreateInput({ ...input, source: { ...input.source, start: 20, end: 10 } }), /selection end/)
  assert.throws(() => __testing.cleanCreateInput({ ...input, quote: 'x'.repeat(12001) }), /exceeds/)
})

test('host source verification requires the exact assistant event and answer', async () => {
  const clean = __testing.cleanCreateInput({ ...input, source: { ...input.source, start: null, end: null } })
  const event = {
    seq: 42,
    type: 'assistant/message',
    data: {
      turn: 3,
      message: { id: 'assistant-message', content: [{ type: 'text', text: input.answer }] },
    },
  }
  const ctx = { sessionController: { inspect: async () => ({ events: [event] }) } }
  await __testing.verifySource(ctx, clean)
  await assert.rejects(() => __testing.verifySource(ctx, { ...clean, answer: '伪造的回答' }), /已经变化/)
  await assert.rejects(() => __testing.verifySource(ctx, { ...clean, source: { ...clean.source, parentTurn: 4 } }), /不匹配/)
})

test('host source verification checks offsets only when the DOM supplied them', async () => {
  const answer = 'prefix quoted passage suffix'
  const start = answer.indexOf('quoted passage')
  const clean = __testing.cleanCreateInput({
    ...input,
    answer,
    quote: 'quoted passage',
    source: { ...input.source, start, end: start + 'quoted passage'.length },
  })
  const event = {
    seq: 42,
    type: 'assistant/message',
    data: { turn: 3, message: { id: 'assistant-message', content: [{ type: 'text', text: answer }] } },
  }
  const ctx = { sessionController: { inspect: async () => ({ events: [event] }) } }
  await __testing.verifySource(ctx, clean)
  await assert.rejects(() => __testing.verifySource(ctx, { ...clean, quote: 'different text' }), /选区位置/)
})

test('creation uses a fresh continuable child and waits for its initial durable event', async () => {
  const parent = { id: 'parent-session' }
  const parentEvent = {
    seq: 42,
    type: 'assistant/message',
    data: { turn: 3, message: { id: 'assistant-message', content: [{ type: 'text', text: input.answer }] } },
  }
  let spec
  const ctx = {
    agents: { get: () => parent },
    sessionController: {},
    sessionQuery: {
      readSession: async (id) => id === 'parent-session'
        ? { events: [parentEvent], session: { id: 'parent-session' }, inheritedEventCount: 0 }
        : {
            events: [{ seq: 0, type: 'user/message', data: { id: 'initial-message', content: spec.request.prompt } }],
            session: { id: 'child-session', origin: 'subagent', parentSession: 'parent-session' },
            inheritedEventCount: 0,
          },
    },
    subagents: {
      getProvider: (name) => name === 'spawn' ? { prepareContinuable: async () => ({}) } : undefined,
      startActivation: async (value) => {
        spec = value
        return { childId: 'child-session', messageId: 'initial-message' }
      },
    },
    on: () => () => {},
  }
  const result = await __testing.createThread(ctx, { ...input, source: { ...input.source, start: null, end: null } })
  assert.equal(result.childId, 'child-session')
  assert.equal(spec.provider, 'spawn')
  assert.equal(spec.delivery, 'caller')
  assert.equal(spec.parent, undefined)
  assert.equal(spec.request.parent, parent)
  assert.ok(spec.signal instanceof AbortSignal)
  assert.equal(__testing.parseQuoteRecord(spec.request.prompt[0].text).question, input.question)
})

test('tree reconstruction keeps only plugin-owned descendants and their hierarchy', async () => {
  const firstPrompt = __testing.formatInitialPrompt(input)
  const nestedInput = {
    ...input,
    source: { ...input.source, parentSessionId: 'child-session', parentTurn: 1, parentSeq: 8, parentMessageId: 'child-answer' },
    question: '嵌套问题',
  }
  const nestedPrompt = __testing.formatInitialPrompt(nestedInput)
  const inspections = {
    'child-session': {
      meta: { origin: 'subagent', parentSession: 'parent-session' },
      inheritedEventCount: 0,
      events: [{ seq: 0, type: 'user/message', data: { content: [{ type: 'text', text: firstPrompt }] } }],
    },
    'grandchild-session': {
      meta: { origin: 'subagent', parentSession: 'child-session' },
      inheritedEventCount: 0,
      events: [{ seq: 0, type: 'user/message', data: { content: [{ type: 'text', text: nestedPrompt }] } }],
    },
  }
  const ctx = {
    subagents: {
      listDescendants: async () => [
        { kind: 'child', id: 'child-session', parentId: 'parent-session', depth: 1, activity: 'inactive', hasChildren: true },
        { kind: 'child', id: 'grandchild-session', parentId: 'child-session', depth: 2, activity: 'inactive', hasChildren: false },
      ],
    },
    sessionController: {},
    sessionQuery: {
      readSession: async (id) => ({
        session: inspections[id].meta,
        events: inspections[id].events,
        inheritedEventCount: inspections[id].inheritedEventCount,
      }),
    },
  }
  const tree = await __testing.buildTree(ctx, 'parent-session')
  assert.equal(tree.contractVersion, 1)
  assert.deepEqual(tree.nodes.map((node) => [node.childId, node.parentId, node.depth]), [
    ['child-session', 'parent-session', 1],
    ['grandchild-session', 'child-session', 2],
  ])
  assert.equal(tree.nodes[1].question, '嵌套问题')
})
