window.__ModuleLoader__.load({
  id: '@local/dsh-quote-threads',
  factory(require) {
    const React = require('react')
    const { MarkdownText } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React
    const NS = 'quote-threads'
    const EMPTY_TREE = Object.freeze({ rootSessionId: '', nodes: [], loading: false, error: null, loaded: false })
    const EMPTY_EVENTS = Object.freeze({ entries: [], revision: 0 })
    const trees = new Map()
    const treeListeners = new Set()
    const treeRequests = new Map()
    const drafts = new Map()
    const draftListeners = new Set()
    const expanded = new Set()
    const expandedListeners = new Set()
    let lastSessionId

    const dictionaries = {
      zh: {
        panel: '引用地图',
        title: '引用地图',
        description: '查看当前会话的引用追问。主线只显示第 0 级问答，子问答按需展开。',
        quoteAsk: '引用追问',
        selectFirst: '请先在当前回答中选择一段文字',
        wrongTurn: '选区不在当前回答里，请重新选择',
        emptySelection: '没有选中可引用的文字',
        sourceNotFinal: '这条回答还没有可引用的完成消息',
        sourceNotFound: '找不到这条回答的位置，请刷新后重试',
        selectedText: '选中原文',
        questionPlaceholder: '针对这段文字提问…',
        ask: '开始追问',
        asking: '创建子问答…',
        cancel: '取消',
        close: '收起',
        threads: '条引用追问',
        childThreads: '条子追问',
        openFull: '打开完整对话',
        open: '打开',
        refresh: '刷新',
        followupPlaceholder: '在这条子问答里继续追问…',
        send: '发送',
        sending: '发送中…',
        loading: '正在读取子问答…',
        preparing: '正在等待回答…',
        noAnswer: '这条子问答还没有回答。',
        you: '你',
        assistant: 'DSH',
        copy: '复制',
        copied: '已复制',
        codeTitle: '代码',
        wrap: '自动换行',
        unwrap: '取消换行',
        footnotes: '脚注',
        session: '会话',
        noSession: '没有可查看的会话',
        emptyMap: '这个会话还没有引用追问。选中回答中的文字，然后点回答操作区的引用按钮即可创建。',
        retry: '重试',
        loadError: '读取失败',
        createError: '创建引用追问失败',
        followupError: '追问发送失败',
        selectionOutOfAnswer: '选区需要位于这条回答的正文里',
        nested: '嵌套追问',
      },
      en: {
        panel: 'Quote map',
        title: 'Quote map',
        description: 'Browse quoted follow-ups. The main conversation stays at level 0 until a thread is expanded.',
        quoteAsk: 'Quote & ask',
        selectFirst: 'Select text in this answer first',
        wrongTurn: 'The selection is outside this answer',
        emptySelection: 'There is no selected text to quote',
        sourceNotFinal: 'This answer has no finalized message to quote yet',
        sourceNotFound: 'Could not locate this answer. Reload and try again',
        selectedText: 'Selected text',
        questionPlaceholder: 'Ask about this passage…',
        ask: 'Ask',
        asking: 'Creating thread…',
        cancel: 'Cancel',
        close: 'Collapse',
        threads: 'quoted threads',
        childThreads: 'nested threads',
        openFull: 'Open full conversation',
        open: 'Open',
        refresh: 'Refresh',
        followupPlaceholder: 'Continue this thread…',
        send: 'Send',
        sending: 'Sending…',
        loading: 'Loading thread…',
        preparing: 'Waiting for the answer…',
        noAnswer: 'This thread has no answer yet.',
        you: 'You',
        assistant: 'DSH',
        copy: 'Copy',
        copied: 'Copied',
        codeTitle: 'Code',
        wrap: 'Wrap lines',
        unwrap: 'Do not wrap lines',
        footnotes: 'Footnotes',
        session: 'Session',
        noSession: 'No session is available',
        emptyMap: 'No quoted threads yet. Select answer text and use the quote action below that answer.',
        retry: 'Retry',
        loadError: 'Could not read threads',
        createError: 'Could not create the quoted thread',
        followupError: 'Could not send the follow-up',
        selectionOutOfAnswer: 'Select text from this answer body',
        nested: 'Nested threads',
      },
    }

    const CSS = `
      .qt-style-anchor{display:none}
      .qt-icon-button{width:28px;height:28px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;padding:5px;cursor:pointer}
      .qt-icon-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .qt-action-error{max-width:240px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:16px}
      .qt-composer{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));max-width:var(--dsh-composer-card-max-width);align-self:center;margin:8px auto;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-soft);display:flex;flex-direction:column;gap:10px}
      .qt-quote{border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);padding:6px 10px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}
      .qt-quote-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
      .qt-input{box-sizing:border-box;width:100%;min-height:74px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;line-height:1.5}
      .qt-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .qt-spacer{flex:1}
      .qt-button{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:6px 12px;font:inherit;cursor:pointer}
      .qt-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .qt-button:disabled{opacity:.5;cursor:default}
      .qt-button-primary{background:var(--dsw-alias-interactive-bg-hover)}
      .qt-error{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap}
      .qt-tail{box-sizing:border-box;width:100%;margin:8px 0 4px}
      .qt-disclosure{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 0;font:inherit;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
      .qt-disclosure:hover{color:var(--dsw-alias-label-primary)}
      .qt-quote-action{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;padding:6px 12px}
      .qt-quote-action:hover{border-color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .qt-thread-list{display:flex;flex-direction:column;gap:12px;margin-top:10px}
      .qt-thread{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft);padding:13px;font-size:calc(var(--dsh-content-font-size,14px) - 1px);line-height:1.55}
      .qt-thread-question{margin:10px 0 0;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}
      .qt-question-label{display:block;margin-bottom:4px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600}
      .qt-messages{display:flex;flex-direction:column;gap:10px;margin-top:12px}
      .qt-message{min-width:0;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}
      .qt-message-role{margin-bottom:5px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650}
      .qt-message-text{color:var(--dsw-alias-label-primary);font-size:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
      .qt-message-markdown{white-space:normal}
      .qt-message-user{background:var(--dsw-alias-interactive-bg-hover)}
      .qt-message-assistant{background:var(--dsw-alias-bg-layer-2)}
      .qt-message-assistant .qt-message-role{color:var(--dsw-alias-state-business-primary)}
      .qt-followup{display:flex;gap:8px;align-items:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
      .qt-followup .qt-input{min-height:56px;flex:1;font-size:inherit}
      .qt-muted{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6}
      .qt-thread .qt-muted{font-size:11px}
      .qt-nested{margin-top:12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
      .qt-map{box-sizing:border-box;height:100%;overflow:auto;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
      .qt-map-inner{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
      .qt-map-title{font-size:22px;font-weight:650;margin:0}
      .qt-map-description{margin:4px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.6}
      .qt-select{max-width:520px;min-width:180px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:7px 10px;font:inherit}
      .qt-map-node{display:block;width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;padding:12px;cursor:pointer}
      .qt-map-node:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .qt-map-node-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .qt-map-question{color:var(--dsw-alias-label-primary);font-weight:600;margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}
      .qt-map-quote{color:var(--dsw-alias-label-secondary);font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
    `

    function subscribe(set, listener) {
      set.add(listener)
      return () => set.delete(listener)
    }

    function publish(set) {
      for (const listener of [...set]) listener()
    }

    async function call(path, input) {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-quote-threads': '1',
        },
        body: JSON.stringify(input),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
      return result.value
    }

    function treeSnapshot(sessionId) {
      return trees.get(sessionId) ?? EMPTY_TREE
    }

    function refreshTree(sessionId) {
      if (!sessionId) return Promise.resolve()
      const existing = treeRequests.get(sessionId)
      if (existing) return existing
      const previous = treeSnapshot(sessionId)
      trees.set(sessionId, { ...previous, loading: true, error: null })
      publish(treeListeners)
      const request = call('/ext/quote-threads/tree', { sessionId })
        .then((value) => {
          trees.set(sessionId, { ...value, loading: false, error: null, loaded: true })
        })
        .catch((error) => {
          trees.set(sessionId, { ...treeSnapshot(sessionId), loading: false, error: error instanceof Error ? error.message : String(error), loaded: true })
        })
        .finally(() => {
          treeRequests.delete(sessionId)
          publish(treeListeners)
        })
      treeRequests.set(sessionId, request)
      return request
    }

    function useTree(sessionId) {
      const value = useSyncExternalStore(
        useCallback((listener) => subscribe(treeListeners, listener), []),
        useCallback(() => treeSnapshot(sessionId), [sessionId]),
      )
      useEffect(() => {
        if (sessionId) void refreshTree(sessionId)
      }, [sessionId])
      return value
    }

    function setDraft(sessionId, value) {
      if (value) drafts.set(sessionId, value)
      else drafts.delete(sessionId)
      publish(draftListeners)
    }

    function useDraft(sessionId) {
      return useSyncExternalStore(
        useCallback((listener) => subscribe(draftListeners, listener), []),
        useCallback(() => drafts.get(sessionId) ?? null, [sessionId]),
      )
    }

    function setExpanded(key, value) {
      if (value) expanded.add(key)
      else expanded.delete(key)
      publish(expandedListeners)
    }

    function useExpanded(key) {
      return useSyncExternalStore(
        useCallback((listener) => subscribe(expandedListeners, listener), []),
        useCallback(() => expanded.has(key), [key]),
      )
    }

    function Style() {
      return h('style', { className: 'qt-style-anchor' }, CSS)
    }

    function BranchIcon({ size = 18 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M6 4v11c0 2 1 3 3 3h8M6 8h8c2 0 3-1 3-3V3m-3 15 3 3 3-3M14 1l3 2-3 2', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function sourceFromChat(snapshot, sessionId, seq) {
      for (const turn of snapshot.timeline.turns.values()) {
        const tail = turn.data.get('turn-tail')
        if (!tail) continue
        const closing = tail.closing
        const tailSeq = closing?.finalNode?.seq ?? tail.seq
        if (tailSeq !== seq) continue
        const messageId = closing?.finalNode?.messageId
        if (!closing || typeof messageId !== 'string') throw new Error('sourceNotFinal')
        const answer = closing.blocks.filter((block) => block.kind === 'text').map((block) => block.text).join('\n\n').trim()
        return {
          source: {
            parentSessionId: sessionId,
            parentMessageId: messageId,
            parentTurn: tail.turn,
            parentSeq: closing.finalNode.seq,
          },
          answer,
        }
      }
      throw new Error('sourceNotFound')
    }

    function captureSelection(source) {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) throw new Error('emptySelection')
      const quote = selection.toString().trim()
      if (!quote) throw new Error('emptySelection')
      const start = source.answer.indexOf(quote)
      source.source.start = start >= 0 ? start : null
      source.source.end = start >= 0 ? start + quote.length : null
      source.quote = quote
      return source
    }

    function QuoteAction({ seq, sessionId, useChat, t }) {
      const [error, setError] = useState('')
      const chatSnapshot = useChat(useCallback((snapshot) => snapshot, []))
      const capture = () => {
        setError('')
        try {
          const selected = captureSelection(sourceFromChat(chatSnapshot, sessionId, seq))
          setDraft(sessionId, selected)
        } catch (cause) {
          const key = cause instanceof Error ? cause.message : ''
          setError(key in dictionaries.zh ? t(key) : key || t('selectionOutOfAnswer'))
        }
      }
      const onMouseDown = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        capture()
      }
      const onClick = (event) => {
        if (event.detail === 0) capture()
      }
      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          className: 'qt-disclosure qt-quote-action',
          title: t('quoteAsk'),
          'aria-label': t('quoteAsk'),
          onMouseDown,
          onClick,
        }, h(BranchIcon, { size: 16 }), h('span', null, t('quoteAsk'))),
        error ? h('span', { className: 'qt-action-error', role: 'alert' }, error) : null,
      )
    }

    function QuoteTurnAction(props) {
      return h('section', { className: 'qt-tail', 'data-quote-action-turn': props.turn },
        h(Style),
        h(QuoteAction, props),
      )
    }

    function QuoteComposer({ sessionId, pluginCtx: ctx, t }) {
      const draft = useDraft(sessionId)
      const [question, setQuestion] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const inputRef = useRef(null)
      useEffect(() => {
        lastSessionId = sessionId
      }, [sessionId])
      useEffect(() => {
        setQuestion('')
        setError('')
        if (draft) inputRef.current?.focus()
      }, [draft])
      if (!draft) return null
      const submit = async () => {
        if (busy || !question.trim()) return
        setBusy(true)
        setError('')
        try {
          await call('/ext/quote-threads/create', { ...draft, question: question.trim() })
          setExpanded(`${sessionId}:seq:${draft.source.parentSeq}`, true)
          setDraft(sessionId, null)
          await refreshTree(sessionId)
        } catch (cause) {
          setError(`${t('createError')}: ${cause instanceof Error ? cause.message : String(cause)}`)
        } finally {
          setBusy(false)
        }
      }
      return h('section', { className: 'qt-composer', 'aria-label': t('quoteAsk') },
        h(Style),
        h('div', { className: 'qt-quote' },
          h('div', { className: 'qt-quote-label' }, t('selectedText')),
          draft.quote,
        ),
        h('textarea', {
          ref: inputRef,
          className: 'qt-input',
          value: question,
          placeholder: t('questionPlaceholder'),
          maxLength: 4000,
          onChange: (event) => setQuestion(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          },
        }),
        error ? h('div', { className: 'qt-error', role: 'alert' }, error) : null,
        h('div', { className: 'qt-row' },
          h('div', { className: 'qt-spacer' }),
          h('button', { type: 'button', className: 'qt-button', disabled: busy, onClick: () => setDraft(sessionId, null) }, t('cancel')),
          h('button', { type: 'button', className: 'qt-button qt-button-primary', disabled: busy || !question.trim(), onClick: () => void submit() }, busy ? t('asking') : t('ask')),
        ),
      )
    }

    function textOf(content) {
      return Array.isArray(content) ? content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n\n') : ''
    }

    function threadMessages(entries, node) {
      const messages = []
      const streaming = new Map()
      for (const entry of entries) {
        const event = entry.event
        if (!event || event.seq < node.initialSeq) continue
        if (entry.type === 'event' && event.type === 'user/message') {
          const kind = event.data?.source?.kind
          if (kind !== 'user' && kind !== 'subagent') continue
          if (event.seq === node.initialSeq) continue
          messages.push({
            key: `user-${event.seq}`,
            role: 'user',
            text: textOf(event.data?.content),
          })
          continue
        }
        if (entry.type === 'event' && event.type === 'assistant/message') {
          messages.push({ key: `assistant-${event.seq}`, role: 'assistant', text: textOf(event.data?.message?.content) })
          continue
        }
        if (entry.type === 'transient' && event.type === 'assistant/live-chunk') {
          const chunk = event.data?.chunk
          const attempt = event.data?.attemptId ?? 'current'
          if (chunk?.type === 'text-delta') streaming.set(attempt, (streaming.get(attempt) ?? '') + chunk.text)
          if (chunk?.type === 'block-end' && chunk.block?.type === 'text') streaming.set(attempt, chunk.block.text)
        }
      }
      for (const [attempt, text] of streaming) {
        if (text) messages.push({ key: `streaming-${attempt}`, role: 'assistant', text, streaming: true })
      }
      return messages.filter((message) => message.text.trim())
    }

    function useChildSession(ctx, node) {
      const [state, setState] = useState({ session: null, error: '' })
      useEffect(() => {
        let cancelled = false
        let reference
        setState({ session: null, error: '' })
        try {
          reference = ctx.sessions.retain({
            parentSessionId: node.parentId,
            childSessionId: node.childId,
            mode: 'continuable',
          }, { source: 'gateway' })
          Promise.resolve(reference.ready).then((binding) => {
            if (!cancelled) setState({ session: binding.session, error: '' })
          }).catch((error) => {
            if (!cancelled) setState({ session: null, error: error instanceof Error ? error.message : String(error) })
          })
        } catch (error) {
          setState({ session: null, error: error instanceof Error ? error.message : String(error) })
        }
        return () => {
          cancelled = true
          reference?.release()
        }
      }, [node.parentId, node.childId])
      return state
    }

    function useEventWindow(session) {
      const subscribeEvents = useMemo(() => session ? (listener) => session.eventSource.subscribe(listener) : () => () => {}, [session])
      const eventSnapshot = useMemo(() => session ? () => session.eventSource.getSnapshot() : () => EMPTY_EVENTS, [session])
      return useSyncExternalStore(subscribeEvents, eventSnapshot)
    }

    function useRunning(session) {
      const subscribeSession = useMemo(() => session ? (listener) => session.subscribe(listener) : () => () => {}, [session])
      const sessionSnapshot = useMemo(() => session ? () => session.getSnapshot().running : () => false, [session])
      return useSyncExternalStore(subscribeSession, sessionSnapshot)
    }

    function markdownLabels(t) {
      return {
        code: {
          copyLabel: t('copy'),
          copiedLabel: t('copied'),
          toolbarLabels: {
            codeLabel: t('codeTitle'),
            wrapLabel: t('wrap'),
            unwrapLabel: t('unwrap'),
          },
        },
        footnotes: t('footnotes'),
      }
    }

    function ChildThread({ node, rootSessionId, pluginCtx: ctx, t }) {
      const tree = useTree(rootSessionId)
      const { session, error: sessionError } = useChildSession(ctx, node)
      const events = useEventWindow(session)
      const running = useRunning(session)
      const [followup, setFollowup] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const nestedKey = `${rootSessionId}:child:${node.childId}`
      const showNested = useExpanded(nestedKey)
      const children = tree.nodes.filter((candidate) => candidate.parentId === node.childId)
      const messages = useMemo(() => threadMessages(events.entries, node), [events, node])
      const markdownCopy = useMemo(() => markdownLabels(t), [t])
      const send = async () => {
        const text = followup.trim()
        if (!session || !text || busy) return
        setBusy(true)
        setError('')
        try {
          const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] })
          const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
          if (!result.ok) throw result.error
          setFollowup('')
        } catch (cause) {
          setError(`${t('followupError')}: ${cause?.message ?? String(cause)}`)
        } finally {
          setBusy(false)
        }
      }
      return h('article', { className: 'qt-thread', 'data-quote-thread': node.id },
        h('div', { className: 'qt-row' },
          h('div', { className: 'qt-muted' }, `${node.depth > 1 ? t('nested') : t('quoteAsk')} · L${node.depth}`),
          h('div', { className: 'qt-spacer' }),
          h('button', { type: 'button', className: 'qt-button', onClick: () => ctx.uiWorkspace.openSession({ parentSessionId: node.parentId, childSessionId: node.childId, mode: 'continuable' }) }, t('openFull')),
        ),
        h('div', { className: 'qt-quote', style: { marginTop: '10px' } },
          h('div', { className: 'qt-quote-label' }, t('selectedText')),
          node.quote,
        ),
        h('div', { className: 'qt-thread-question' },
          h('span', { className: 'qt-question-label' }, t('you')),
          node.question,
        ),
        sessionError ? h('div', { className: 'qt-error', role: 'alert' }, sessionError) : null,
        !session && !sessionError ? h('div', { className: 'qt-muted' }, t('loading')) : null,
        session && messages.length === 0 ? h('div', { className: 'qt-muted' }, running ? t('preparing') : t('noAnswer')) : null,
        h('div', { className: 'qt-messages' }, messages.map((message) => h('div', {
          key: message.key,
          className: `qt-message qt-message-${message.role}`,
        },
        h('div', { className: 'qt-message-role' }, message.role === 'user' ? t('you') : t('assistant')),
        message.role === 'assistant'
          ? h('div', { className: 'qt-message-text qt-message-markdown' }, h(MarkdownText, {
            text: message.text,
            streaming: Boolean(message.streaming),
            labels: markdownCopy,
            variant: 'compact',
          }))
          : h('div', { className: 'qt-message-text' }, message.text),
        ))),
        session ? h('div', { className: 'qt-followup' },
          h('textarea', {
            className: 'qt-input',
            value: followup,
            placeholder: t('followupPlaceholder'),
            maxLength: 4000,
            onChange: (event) => setFollowup(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            },
          }),
          h('button', { type: 'button', className: 'qt-button', disabled: busy || !followup.trim(), onClick: () => void send() }, busy ? t('sending') : t('send')),
        ) : null,
        error ? h('div', { className: 'qt-error', role: 'alert' }, error) : null,
        children.length ? h('div', { className: 'qt-nested' },
          h('button', { type: 'button', className: 'qt-disclosure', onClick: () => setExpanded(nestedKey, !showNested) },
            h('span', null, showNested ? '▾' : '▸'),
            `${children.length} ${t('childThreads')}`,
          ),
          showNested ? h('div', { className: 'qt-thread-list' }, children.map((child) => h(ChildThread, { key: child.childId, node: child, rootSessionId, pluginCtx: ctx, t }))) : null,
        ) : null,
      )
    }

    function QuoteTail({ seq, sessionId, useProjection, pluginCtx: ctx, t }) {
      const catalog = useProjection('subagentCatalog')
      const tree = useTree(sessionId)
      const key = `${sessionId}:seq:${seq}`
      const open = useExpanded(key)
      const nodes = tree.nodes.filter((node) => node.parentId === sessionId && node.source.parentSeq === seq)
      useEffect(() => {
        lastSessionId = sessionId
      }, [sessionId])
      useEffect(() => {
        if (catalog !== undefined) void refreshTree(sessionId)
      }, [catalog, sessionId])
      if (!nodes.length) return null
      return h('section', { className: 'qt-tail' },
        h(Style),
        h('button', { type: 'button', className: 'qt-disclosure', 'aria-expanded': open, onClick: () => setExpanded(key, !open) },
          h('span', null, open ? '▾' : '▸'),
          `${nodes.length} ${t('threads')}`,
        ),
        open ? h('div', { className: 'qt-thread-list' }, nodes.map((node) => h(ChildThread, { key: node.childId, node, rootSessionId: sessionId, pluginCtx: ctx, t }))) : null,
      )
    }

    function QuoteMap({ useSessions, pluginCtx: ctx, t }) {
      const sessions = useSessions((snapshot) => snapshot)
      const roots = sessions.ids.map((id) => sessions.byId[id]).filter((row) => row && row.origin !== 'subagent')
      const [selected, setSelected] = useState(lastSessionId ?? '')
      const tree = useTree(selected)
      useEffect(() => {
        if (selected && roots.some((row) => row.id === selected)) return
        const next = roots.some((row) => row.id === lastSessionId) ? lastSessionId : roots[0]?.id ?? ''
        setSelected(next)
      }, [sessions, selected])
      const nodes = tree.nodes
      return h('main', { className: 'qt-map' },
        h(Style),
        h('div', { className: 'qt-map-inner' },
          h('header', null,
            h('h1', { className: 'qt-map-title' }, t('title')),
            h('p', { className: 'qt-map-description' }, t('description')),
          ),
          h('div', { className: 'qt-row' },
            h('label', { htmlFor: 'qt-session-select' }, t('session')),
            h('select', {
              id: 'qt-session-select',
              className: 'qt-select',
              value: selected,
              onChange: (event) => setSelected(event.target.value),
            }, roots.map((row) => h('option', { key: row.id, value: row.id }, row.title || row.id))),
            h('button', { type: 'button', className: 'qt-button', disabled: !selected || tree.loading, onClick: () => void refreshTree(selected) }, t('refresh')),
          ),
          !roots.length ? h('div', { className: 'qt-muted' }, t('noSession')) : null,
          tree.error ? h('div', { className: 'qt-error', role: 'alert' }, `${t('loadError')}: ${tree.error}`) : null,
          selected && tree.loaded && !nodes.length && !tree.error ? h('div', { className: 'qt-muted' }, t('emptyMap')) : null,
          nodes.map((node) => h('button', {
            type: 'button',
            key: node.childId,
            className: 'qt-map-node',
            style: {
              marginLeft: `${Math.min(node.depth - 1, 8) * 22}px`,
              width: `calc(100% - ${Math.min(node.depth - 1, 8) * 22}px)`,
            },
            onClick: () => ctx.uiWorkspace.openSession({ parentSessionId: node.parentId, childSessionId: node.childId, mode: 'continuable' }),
          },
          h('div', { className: 'qt-map-node-head' },
            h('span', null, `L${node.depth}`),
            h('div', { className: 'qt-spacer' }),
            h('span', null, `${t('open')} →`),
          ),
          h('div', { className: 'qt-map-question' }, node.question),
          h('div', { className: 'qt-map-quote' }, node.quote),
          )),
        ),
      )
    }

    return {
      inject: ['slots', 'sessions', 'uiWorkspace', 'layout', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'quote-threads: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'quote-threads',
          order: 20,
          label: () => t('panel'),
        }, () => h(BranchIcon, { size: 20 })))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'quote-threads',
        }, (props) => h(QuoteMap, { ...props, pluginCtx: ctx, t })))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'quote-threads',
          order: 30,
        }, (props) => h(QuoteComposer, { ...props, pluginCtx: ctx, t })))
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'quote-threads-action',
          order: 25,
        }, (props) => h(QuoteTurnAction, { ...props, pluginCtx: ctx, t })))
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'quote-threads',
          order: 30,
        }, (props) => h(QuoteTail, { ...props, pluginCtx: ctx, t })))
      },
    }
  },
})
