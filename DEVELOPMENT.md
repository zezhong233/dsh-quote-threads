# DSH Plugin Development Notes from Quote Threads

> Scope: lessons verified while building Quote Threads on DSH Desktop `0.2.1-rc.3` in 2026-11. These are implementation notes, not a promise that undocumented internals will remain stable. Inspect the live APIs again after a DSH upgrade.

## 1. Start with the live contracts

- [Verified 2026-11] Use `cordis_inspect_list` before choosing a Provider, then use `cordis_inspect_query` for the exact Service, Event, Slot, or Theme contract.
- [Verified 2026-11] Inspect the selected Slot's `ownerProps`, `standardProps`, `kind`, `scope`, and `replaceRisk` before writing its component.
- [Verified 2026-11] Use the official `plugin_manager.install_bundle` workflow; do not hand-edit the profile's `package.json`, `cordis.patch.yml`, or `node_modules`.
- [Verified 2026-11] Repeating `install_bundle` for a linked package can return `already-installed`; `remove_bundle` followed by `install_bundle` reloaded the Host generation during this project.
- [Verified 2026-11] A linked Host package resolves imports from its real source directory, so keep the Host dependency-free or install runtime dependencies in that source package.
- [Verified 2026-11] If pnpm reports `ERR_PNPM_UNEXPECTED_STORE`, set the profile workspace's `storeDir` to the existing `$DSH_HOME/.pnpm-store/v11`; the tested `.npmrc` spelling did not fix resolution.

## 2. The browser Client is a ModuleLoader module

- [Verified 2026-11] The Client artifact calls `window.__ModuleLoader__.load({ id, factory(require) { ... } })`; React comes from `require('react')`, so no second React installation or CDN script is needed.
- [Verified 2026-11] Register Slot entries and effects inside `apply(ctx)` so the Host can dispose them with the plugin generation.
- [Verified 2026-11] Component-local style elements are a simple way to remove plugin CSS when the component unmounts.

## 3. Slots used by this plugin

| Slot | Verified behavior | Lesson |
| --- | --- | --- |
| `conversation.chat.turnTail` | List entries receive `turn`, `seq`, `sessionId`, `useChat`, and other standard session props. | Suitable for a visible quote action and an on-demand child-thread list below a completed answer. |
| `conversation.input.dock` | Full-width list entries above the composer card. | Suitable for the quote composer in normal document flow. |
| `conversation.input.overlay` | Rendered in a zero-height overlay anchor inside the composer card. | It overlapped the main input and was the wrong place for a normal card. |
| `conversation.input.attachments` | A `single` Slot owned by the shipped attachment presentation. | Registering here can replace shipped attachment UI; it is not a free additive rail. |
| `conversation.composer.dock` | Ambient entries below the composer card. | Do not confuse it with `conversation.input.dock` above the card. |

- [Verified 2026-11] Split the always-visible quote button from the data-heavy thread-list component; this kept a tree or projection failure from hiding the only action entry.
- [Verified 2026-11] Render the action without waiting for a message ID or a quote-tree response, then resolve the exact source when the user acts.
- [Verified 2026-11] An active Slot occupant proves registration only; it does not prove that the component rendered, returned non-null content, or survived its hooks.

## 4. Match Chat data by `seq`, not the Slot's `turn` value

- [Verified 2026-11] Comparing the `turnTail` owner prop `turn` with the Chat projection's internal `tail.turn` produced `sourceNotFound` in the live UI.
- [Verified 2026-11] The owner prop `seq` matched `closing.finalNode.seq` exactly and also worked for thread attachment and automatic expansion.

The stable lookup pattern used here is:

```js
for (const chatTurn of snapshot.timeline.turns.values()) {
  const tail = chatTurn.data.get('turn-tail')
  if (!tail) continue
  const closing = tail.closing
  const tailSeq = closing?.finalNode?.seq ?? tail.seq
  if (tailSeq !== ownerSeq) continue
  // Resolve parentMessageId, parentTurn, parentSeq, and answer text here.
}
```

- [Verified 2026-11] Use the same `seq` coordinate for source lookup, parent-to-child filtering, and expansion keys; mixing coordinates created a second mismatch risk.
- [Verified 2026-11] Subscribe with the provided `useChat` hook and use the resulting snapshot in the event handler instead of assuming an undocumented `useChat.getSnapshot()` shape.

## 5. Preserve the browser selection and show the real error

- [Verified 2026-11] Capture the selection on `mousedown`, call `preventDefault()`, and retain a keyboard path through `onClick` when `event.detail === 0`.
- [Verified 2026-11] Reading the selection only on the later click made the flow vulnerable to focus and selection changes.
- [Verified 2026-11] Clear the previous error at the start of every attempt so a successful retry does not leave stale feedback.
- [Verified 2026-11] Do not translate every exception into one selection error; an unrelated source lookup failure was initially hidden behind `选区需要位于这条回答的正文里`.
- [Verified 2026-11] Keep a small set of known, localized error keys and display unknown exception messages unchanged for diagnosis.
- [Verified 2026-11] The final Client does not gate quoting on DOM-turn ancestry; it checks only that selected text is non-empty and records exact offsets when `answer.indexOf(quote)` succeeds, avoiding a presentation-internal dependency that was unnecessary for Host source verification.
- [Verified 2026-11] Rendered Markdown can make selected text differ from the raw answer, so offsets must be optional rather than a second brittle DOM gate.
- [Verified 2026-11] The Host still verifies the parent session, assistant message, event sequence, answer text, and supplied offsets; relaxing Client selection validation did not remove source authentication.

## 6. Child sessions are durable DSH subagents

- [Verified 2026-11] Use the real continuable subagent provider with `delivery: 'caller'`, the exact live parent Agent, and an abort `signal`.
- [Verified 2026-11] The parent belongs in `request.parent`, not at the top level of the spawn specification.
- [Verified 2026-11] `resolveAgent()` may return an Agent directly or `{ agent }`; the adapter must accept both shapes.
- [Verified 2026-11] Start acceptance does not prove that the initial user message is durable; wait for that event before returning success to the Client.
- [Verified 2026-11] `delivery: 'caller'` keeps child completion notices out of the parent timeline, preserving a level-0 main conversation.
- [Verified 2026-11] Rebuild the hierarchy from `subagents.listDescendants(rootSessionId)`, `sessionController.inspect(childId)`, and a versioned marker in the first `user/message` event.
- [Verified 2026-11] Do not add a second relationship database when the durable session logs and catalog already contain the parent, child, quote, and question.

## 7. Streaming and event shapes

- [Verified 2026-11] Retain a child with `ctx.sessions.retain(address, { source: 'gateway' })`, await `reference.ready`, and release the reference on unmount.
- [Verified 2026-11] `binding.session.eventSource` can back `useSyncExternalStore` for live child events.
- [Verified 2026-11] Initial and follow-up user text is read from `event.data.content`.
- [Verified 2026-11] Durable assistant text is read from `event.data.message.content`.
- [Verified 2026-11] Live assistant text arrives in `assistant/live-chunk`; coalesce text deltas by attempt ID and replace them with block-end text when available.

## 8. Match the composer layout with its actual CSS variables

- [Verified 2026-11] `width: 100%` only fills the immediate parent; it did not make the quote composer match the narrower main composer.
- [Verified 2026-11] The main composer card uses `--dsh-composer-card-max-width`, while its outer wrapper supplies `--dsh-composer-side-clearance` on both sides.
- [Verified 2026-11] Reuse those variables instead of copying a pixel width from a screenshot.

```css
.qt-composer {
  box-sizing: border-box;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));
  max-width: var(--dsh-composer-card-max-width);
  margin: 8px auto;
}
```

- [Verified 2026-11] Use theme tokens for borders, surfaces, text, shadows, and business accents so the same plugin remains readable in light and dark themes.
- [Verified 2026-11] Use `--dsh-content-font-size-secondary` for the compact quote composer and a small relative reduction for inline threads; otherwise both inherit the larger primary composer typography.
- [Verified 2026-11] Separate quote, question, and assistant answer through spacing, role labels, surfaces, and one accent border rather than adding more hard-coded colors.

## 9. Reuse native Markdown and LaTeX rendering

- [Verified 2026-11] Plain-text inline messages cannot render Markdown or LaTeX even when the same content looks correct in the full native child session.
- [Verified 2026-11] The Client ModuleLoader can require DSH's already installed `@deepseek-ai/dsh-client-ui-primitives` and use its exported `MarkdownText` component.
- [Verified 2026-11] No external KaTeX package, CDN, or duplicate renderer is needed for inline formulas.

```js
const { MarkdownText } = require('@deepseek-ai/dsh-client-ui-primitives')

h(MarkdownText, {
  text: message.text,
  streaming: Boolean(message.streaming),
  variant: 'compact',
  labels: {
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
  },
})
```

- [Verified 2026-11] Supply the code toolbar and footnote labels used by the native component instead of leaving its chrome without localized copy.
- [Verified 2026-11] Native inline rendering still does not provide the full session's tool cards and native actions; keep an `Open full conversation` path for those capabilities.

## 10. Verification and publication checklist

- [Verified 2026-11] Run syntax checks, Host tests, JSON parsing, and `git diff --check` before every install or commit.

```bash
node --check index.js
node --check client.js
node --test host.test.mjs
python3 -m json.tool package.json >/dev/null
python3 -m json.tool locale/zh.json >/dev/null
python3 -m json.tool locale/en.json >/dev/null
git diff --check
```

- [Verified 2026-11] Test source validation, malformed records, durable-event waiting, and nested tree reconstruction with Host unit tests instead of inserting fake quotes into a real user session.
- [Verified 2026-11] A successful Host route response and an active Slot registration are necessary checks, but neither replaces a user-visible end-to-end test.
- [Verified 2026-11] If browser authentication prevents automated QA, state that limit and verify through the real user flow rather than claiming success from source inspection.
- [Verified 2026-11] Before a public commit, scan the package for absolute home paths, session identifiers, credentials, and tokens.
- [Verified 2026-11] After `gh auth login`, run `gh auth setup-git` so later plain `git push` commands can use the GitHub CLI credential helper non-interactively.
