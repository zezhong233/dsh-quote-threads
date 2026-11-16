import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

let definition
const window = {
  __ModuleLoader__: {
    load(value) {
      definition = value
    },
  },
}
vm.runInNewContext(fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8'), { window })
const React = { createElement: () => null }
const api = definition.factory((name) => {
  if (name === 'react') return React
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: () => null }
  throw new Error(`Unexpected module: ${name}`)
})
const { selectionText, quoteParts, highlightName, quoteOccurrence, quoteColor } = api.__testing

function text(value) {
  return { nodeType: 3, nodeValue: value }
}

function element(tagName, children, classes = [], tex = null) {
  return {
    nodeType: 1,
    tagName,
    childNodes: children,
    classList: { contains: (name) => classes.includes(name) },
    querySelector: () => tex === null ? null : { textContent: tex },
  }
}

function selection(fragment, fallback = 'fallback') {
  return {
    getRangeAt: () => ({ cloneContents: () => fragment }),
    toString: () => fallback,
  }
}

test('KaTeX selection emits one TeX expression without duplicated visual math', () => {
  const first = element('SPAN', [text('[ O I I ] λ 3727 [OII]λ3727')], ['katex'], '\\mathrm{[OII]}\\lambda 3727')
  const second = element('SPAN', [text('H α Hα')], ['katex'], 'H\\alpha')
  const fragment = {
    nodeType: 11,
    childNodes: [text('观测到 '), first, text(' 和 '), second, text('。')],
  }
  assert.equal(
    selectionText(selection(fragment)),
    '观测到 $\\mathrm{[OII]}\\lambda 3727$ 和 $H\\alpha$。',
  )
})

test('selection preserves paragraph boundaries and normalizes special spaces', () => {
  const fragment = {
    nodeType: 11,
    childNodes: [
      element('P', [text('第一段\u2009文字')]),
      element('P', [text('第二段')]),
    ],
  }
  assert.equal(selectionText(selection(fragment)), '第一段 文字\n\n第二段')
})

test('selection falls back to browser text when cloning yields no text', () => {
  const fragment = { nodeType: 11, childNodes: [] }
  assert.equal(selectionText(selection(fragment, '普通选区')), '普通选区')
})

test('quote highlighting separates text and TeX parts', () => {
  const parts = quoteParts('观测到 $\\mathrm{[OII]}\\lambda 3727$ 和\n$H\\alpha$。')
  assert.equal(JSON.stringify(parts), JSON.stringify([
    { kind: 'text', value: '观测到' },
    { kind: 'math', value: '\\mathrm{[OII]}\\lambda 3727' },
    { kind: 'text', value: '和' },
    { kind: 'math', value: 'H\\alpha' },
    { kind: 'text', value: '。' },
  ]))
  assert.equal(highlightName('quote-1'), highlightName('quote-1'))
  assert.notEqual(highlightName('quote-1'), highlightName('quote-2'))
})

test('quote occurrence follows the stored answer offset', () => {
  const quote = '到 GitHub'
  const answer = `${quote} 的一次提交，之后再次回${quote}。`
  const start = answer.lastIndexOf(quote)
  const node = { quote, source: { start, end: start + quote.length } }
  assert.equal(quoteOccurrence(answer, node), 1)
  assert.equal(quoteOccurrence(answer, { quote, source: { start: null, end: null } }), 0)
})

test('quote colors provide an ordered eight-color cycle', () => {
  const colors = Array.from({ length: 8 }, (_, index) => quoteColor(index))
  assert.equal(new Set(colors).size, 8)
  assert.equal(quoteColor(8), quoteColor(0))
})
