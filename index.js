import { randomUUID } from 'node:crypto'

export const inject = ['webServer', 'connection', 'subagents', 'sessionController', 'sessionPersistence', 'sessionQuery', 'agents']

const MARKER_START = '[[DSH_QUOTE_THREAD_V1]]'
const MARKER_END = '[[/DSH_QUOTE_THREAD_V1]]'
const MAX_BODY_BYTES = 1024 * 1024
const MAX_ANSWER_CHARS = 30000
const MAX_QUOTE_CHARS = 12000
const MAX_QUESTION_CHARS = 4000

function textOf(content) {
  return Array.isArray(content)
    ? content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n\n')
    : ''
}

function cleanText(value, maximum, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  const text = value.trim()
  if (text.length > maximum) throw new Error(`${field} exceeds ${maximum} characters`)
  return text
}

function cleanSource(value) {
  if (typeof value !== 'object' || value === null) throw new Error('source is required')
  const source = {
    parentSessionId: cleanText(value.parentSessionId, 256, 'parentSessionId'),
    parentMessageId: cleanText(value.parentMessageId, 256, 'parentMessageId'),
    parentTurn: value.parentTurn,
    parentSeq: value.parentSeq,
  }
  if (!Number.isSafeInteger(source.parentTurn) || source.parentTurn < 0) throw new Error('parentTurn is invalid')
  if (!Number.isSafeInteger(source.parentSeq) || source.parentSeq < 0) throw new Error('parentSeq is invalid')
  if (value.start !== null && value.start !== undefined) {
    if (!Number.isSafeInteger(value.start) || value.start < 0) throw new Error('selection start is invalid')
    source.start = value.start
  } else source.start = null
  if (value.end !== null && value.end !== undefined) {
    if (!Number.isSafeInteger(value.end) || value.end < source.start) throw new Error('selection end is invalid')
    source.end = value.end
  } else source.end = null
  return source
}

function cleanCreateInput(value) {
  if (typeof value !== 'object' || value === null) throw new Error('JSON object expected')
  return {
    source: cleanSource(value.source),
    answer: cleanText(value.answer, MAX_ANSWER_CHARS, 'answer'),
    quote: cleanText(value.quote, MAX_QUOTE_CHARS, 'quote'),
    question: cleanText(value.question, MAX_QUESTION_CHARS, 'question'),
  }
}

function formatInitialPrompt(input) {
  const record = {
    version: 1,
    id: randomUUID(),
    source: input.source,
    quote: input.quote,
    question: input.question,
  }
  const instructions = [
    '这是一次引用追问。上面的结构化记录给出了母会话、母回答消息、轮次、事件位置和选区范围。',
    '请围绕“选中原文”和“用户问题”回答；“母回答原文”用于消除指代歧义。除非用户明确要求，不要改写成对整场对话的总结。',
  ].join('\n')
  return `${MARKER_START}\n${JSON.stringify(record)}\n${MARKER_END}\n${instructions}\n\n<parent-answer>\n${input.answer}\n</parent-answer>\n\n<quoted-text>\n${input.quote}\n</quoted-text>\n\n<question>\n${input.question}\n</question>`
}

function parseQuoteRecord(text) {
  const start = text.indexOf(MARKER_START)
  if (start < 0) return undefined
  const jsonStart = start + MARKER_START.length
  const end = text.indexOf(MARKER_END, jsonStart)
  if (end < 0) return undefined
  try {
    const record = JSON.parse(text.slice(jsonStart, end).trim())
    if (record?.version !== 1 || typeof record.id !== 'string') return undefined
    const source = cleanSource(record.source)
    return {
      version: 1,
      id: record.id,
      source,
      quote: cleanText(record.quote, MAX_QUOTE_CHARS, 'quote'),
      question: cleanText(record.question, MAX_QUESTION_CHARS, 'question'),
    }
  } catch {
    return undefined
  }
}

function quoteFromEvents(events, inheritedEventCount = 0) {
  for (const event of events.slice(inheritedEventCount)) {
    if (event?.type !== 'user/message') continue
    const record = parseQuoteRecord(textOf(event.data?.content))
    if (record !== undefined) return { record, initialSeq: event.seq }
  }
  return undefined
}

function json(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

function fail(res, status, message) {
  json(res, status, { ok: false, error: message })
}

function authorize(ctx, req, res) {
  if (req.method !== 'POST') {
    fail(res, 405, 'POST required')
    return false
  }
  if (req.headers['x-dsh-quote-threads'] !== '1') {
    fail(res, 403, 'missing plugin request marker')
    return false
  }
  if (!ctx.connection.isTrusted(req)) {
    fail(res, 403, 'cross-origin request rejected')
    return false
  }
  return true
}

async function body(req) {
  let bytes = 0
  let text = ''
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new Error('request body is too large')
    text += chunk.toString('utf8')
  }
  return JSON.parse(text || '{}')
}

function chooseProvider(subagents) {
  const provider = subagents.getProvider('spawn')
  if (provider?.prepareContinuable === undefined) throw new Error('当前 Profile 没有启用 spawn 持续子会话提供方')
  return 'spawn'
}

async function waitForInitialMessage(ctx, childId, messageId) {
  let dispose = () => {}
  let timer
  try {
    return await new Promise((resolve, reject) => {
      const check = (events) => {
        for (const event of events) {
          if (event?.type === 'user/message' && event.data?.id === messageId && quoteFromEvents([event]) !== undefined) return true
        }
        return false
      }
      dispose = ctx.on('session/event', (session, event) => {
        if (session.id === childId && check([event])) resolve()
      }, { global: true })
      timer = setTimeout(() => reject(new Error('子会话首条消息写入超时，请稍后刷新引用地图')), 10000)
      void ctx.sessionController.inspect(childId).then((inspected) => {
        if (check(inspected.events)) resolve()
      }, reject)
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    dispose()
  }
}

async function resolveParent(ctx, parentId) {
  const live = ctx.agents.get(parentId)
  if (live !== undefined) return live
  const inspected = await ctx.sessionController.inspect(parentId)
  if (inspected.meta?.origin === 'subagent') throw new Error('请先打开这条子会话，再在其中创建嵌套引用')
  const found = await ctx.sessionController.resolveAgent(parentId)
  if (found?.error) throw new Error(found.error.message ?? '无法恢复母会话')
  const parent = found?.agent ?? found
  if (parent?.id !== parentId) throw new Error('母会话当前不可用')
  return parent
}

async function verifySource(ctx, input) {
  const { source, answer, quote } = input
  const inspected = await ctx.sessionController.inspect(source.parentSessionId)
  const event = inspected.events.find((candidate) => candidate.seq === source.parentSeq)
  if (event?.type !== 'assistant/message' || event.data?.message?.id !== source.parentMessageId || event.data?.turn !== source.parentTurn) {
    throw new Error('引用位置与母回答不匹配，请刷新后重试')
  }
  const actualAnswer = textOf(event.data.message.content).trim()
  if (actualAnswer !== answer) throw new Error('母回答内容已经变化，请重新选择')
  if (source.start !== null && actualAnswer.slice(source.start, source.end) !== quote) throw new Error('选区位置与母回答不匹配')
}

async function createThread(ctx, input) {
  const clean = cleanCreateInput(input)
  const parentId = clean.source.parentSessionId
  await verifySource(ctx, clean)
  const parent = await resolveParent(ctx, parentId)
  const provider = chooseProvider(ctx.subagents)
  const signal = new AbortController().signal
  const activation = await ctx.subagents.startActivation({
    provider,
    label: `引用：${clean.question.replace(/\s+/g, ' ').slice(0, 60)}`,
    signal,
    delivery: 'caller',
    request: {
      parent,
      prompt: [{ type: 'text', text: formatInitialPrompt(clean) }],
      maxDepth: 32,
    },
  })
  if (typeof activation.messageId !== 'string') throw new Error('子会话没有返回首条消息编号')
  await waitForInitialMessage(ctx, activation.childId, activation.messageId)
  return {
    childId: activation.childId,
    parentId,
    messageId: activation.messageId,
  }
}

async function buildTree(ctx, rootSessionId) {
  if (typeof rootSessionId !== 'string' || rootSessionId.trim() === '') throw new Error('sessionId is required')
  const descendants = await ctx.subagents.listDescendants(rootSessionId)
  const nodes = []
  for (const descendant of descendants) {
    if (descendant.kind !== 'child') continue
    const inspected = await ctx.sessionController.inspect(descendant.id)
    if (inspected.meta?.origin !== 'subagent' || inspected.meta?.parentSession !== descendant.parentId) continue
    const found = quoteFromEvents(inspected.events, inspected.inheritedEventCount)
    if (found === undefined || found.record.source.parentSessionId !== descendant.parentId) continue
    nodes.push({
      id: found.record.id,
      childId: descendant.id,
      parentId: descendant.parentId,
      rootSessionId,
      depth: descendant.depth,
      activity: descendant.activity,
      hasChildren: descendant.hasChildren,
      initialSeq: found.initialSeq,
      source: found.record.source,
      quote: found.record.quote,
      question: found.record.question,
    })
  }
  return { contractVersion: 1, rootSessionId, nodes }
}

function route(ctx, path, operation) {
  return ctx.webServer.register({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      if (!authorize(ctx, req, res)) return
      try {
        const value = await operation(await body(req))
        json(res, 200, { ok: true, value })
      } catch (error) {
        fail(res, 400, error instanceof Error ? error.message : String(error))
      }
    },
  })
}

export function apply(ctx) {
  return ctx.effect(() => {
    const disposeCreate = route(ctx, '/ext/quote-threads/create', (input) => createThread(ctx, input))
    const disposeTree = route(ctx, '/ext/quote-threads/tree', (input) => buildTree(ctx, input.sessionId))
    return () => {
      disposeCreate()
      disposeTree()
    }
  }, 'quote-threads: routes')
}

export const __testing = {
  authorize,
  buildTree,
  cleanCreateInput,
  createThread,
  formatInitialPrompt,
  parseQuoteRecord,
  quoteFromEvents,
  textOf,
  verifySource,
}
