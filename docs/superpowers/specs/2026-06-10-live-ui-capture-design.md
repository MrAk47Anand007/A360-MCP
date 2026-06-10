# Live UI Capture and Recorder Step Injection — Design

Date: 2026-06-10
Status: Approved

## Goal

Add a live UI capture path to A360-MCP so UI automation bot steps are built from
real captured browser state, never from AI-invented recorder payloads:

```
live UI capture -> minimal canonical target payload -> inject into bot JSON -> save
```

A prompt-driven recording session ("click the Login button, type the email, submit")
is decomposed by the MCP client into structured steps; the server executes each step
live in Chrome, captures the acted-on element at the moment of action, and converts
it into canonical `UIOBJECT` / `IMAGE` / anchor `DICTIONARY` payloads that flow
through the existing normalized save pipeline.

## Decisions

1. **Capture host: embedded CDP in the MCP server.** The server connects to the
   user's real Chrome via the DevTools Protocol using `puppeteer-core` (no bundled
   browser). Works for any MCP client; the user is already logged into target apps
   in their own Chrome.
2. **v1 flow scope: full recording session.** One tool call takes a starting URL +
   ordered structured steps and returns ordered captured recorder steps. A
   single-target capture primitive is also exposed.
3. **Step resolution: structured steps + deterministic matcher.** The MCP client
   (the LLM) turns the natural-language prompt into structured steps
   (`{action, target, text?, hints?}`). The server matches each target description
   against page element facts deterministically (role, name, text, tag, aria
   attributes). No NL parsing and no guessing inside the server. Ambiguity and
   no-match are explicit result states that return candidates.
4. **Criteria grounding.** `UIOBJECT.criteria` keys are grounded against the live
   Recorder package command schema (via existing `getPackageCommandSchema`) and the
   Control Room normalization rules already encoded in
   `src/workflows/repository-save.ts` — not invented.
5. **Out of scope for v1:** desktop/UIA capture, the opaque transient recorder
   blob, deep iframe/shadow-DOM traversal beyond what puppeteer-core exposes
   naturally, multi-tab flows.

## Architecture

### New modules

1. **`src/capture/chrome-session.ts`**
   - Attaches to running Chrome (ws endpoint / `--remote-debugging-port`) or
     launches a local Chrome with a debugging port, via `puppeteer-core`.
   - Exposes a narrow `CaptureBrowser` interface:
     `gotoUrl`, `snapshotElements`, `click`, `type`, `select`,
     `screenshotElement`, `close`.
   - `snapshotElements` returns a list of **element facts**: stable per-snapshot
     id, role, accessible name, visible text, tag, dom path, id/name/aria
     attributes, placeholder, visibility, bounding box.
   - Everything above this module depends only on the interface; tests use a fake.
   - Chrome unreachable produces a clear, actionable error (how to start Chrome
     with a debugging port).

2. **`src/capture/element-matcher.ts`** (pure)
   - `matchElement(targetDescription, hints, elementFacts[]) -> MatchResult`
   - Deterministic token-based scoring: accessible name match, visible text match,
     role keyword match (button/link/field/checkbox...), attribute matches
     (placeholder, aria-label, id, name), visibility boosts.
   - `MatchResult` is one of: `matched` (single confident winner), `ambiguous`
     (top candidates too close — returns ranked candidates), `not-found`
     (returns nearest candidates). Never silently picks among near-ties.

3. **`src/capture/target-payload.ts`** (pure)
   - `buildCapturedTargetPayload(elementFacts, options) -> CapturedTargetPayload`
   - Produces canonical pieces:
     - `UIOBJECT` with `capture` and `criteria` (dom path, title/name, role, tag,
       relevant attributes), shaped to survive `normalizeTypedValue` unchanged.
     - optional `IMAGE` typed value from an element screenshot (base64).
     - optional anchor `DICTIONARY`.
   - Also produces a ready-made Recorder-package node JSON for the action
     (click/type/select), reusing the planner's node-building conventions.

4. **`src/workflows/ui-recording.ts`** (orchestrator)
   - Input: `{ startUrl, steps: [{action: 'navigate'|'click'|'type'|'select',
     target?, text?, value?, hints?}], captureImages? }`.
   - Per step: snapshot page -> match -> act -> capture element facts and
     screenshot at the moment of action -> build payload.
   - Output: ordered step results with payloads and node JSON.
   - A failed or ambiguous step halts the session and returns progress so far
     plus the candidate report so the client can refine the step and re-run.

5. **`src/workflows/bot-injection.ts`**
   - `insertRecorderStep(repositoryApi, {fileId, node(s), position|afterUid})` —
     fetch bot content, insert node(s), save via existing `saveBotBundle`.
   - `patchStepTarget(repositoryApi, {fileId, nodeUid, attributeName, payload})` —
     replace one node attribute's typed value with a captured payload, save.
   - Ensures the Recorder package is present in `packages` when injecting.

### New MCP tools (`src/tools/`, existing registration pattern)

- `a360_record_web_actions` — full recording session.
- `a360_capture_ui_target` — single-element capture (no action; capture only).
- `a360_insert_recorder_step` — inject captured step(s) into a bot and save.
- `a360_patch_step_target` — patch an existing node's target payload and save.

## Data flow

```
MCP client (LLM): prompt -> structured steps
  -> a360_record_web_actions
     chrome-session: snapshot -> element facts
     element-matcher: target description -> matched element
     chrome-session: act (click/type/select) + screenshot
     target-payload: facts -> UIOBJECT/IMAGE/DICTIONARY + node JSON
  -> a360_insert_recorder_step (fileId, nodes)
     bot-injection: content fetch -> insert -> saveBotBundle (normalize + PUT)
```

## Error handling

- Chrome unreachable: setup guidance in the tool error.
- Match ambiguity / not found: structured candidate report; session halts with
  partial progress; no silent guesses.
- Action failure (element detached, navigation race): step error with page URL
  and element description; partial progress returned.
- Save failure: Control Room error surfaced untouched (existing behavior).

## Testing

- `element-matcher` and `target-payload`: pure unit tests with fixture element
  facts (derived from real ACMEBot research data where available).
- `bot-injection`: unit tests with a fake repository API (existing pattern from
  `tests/repository-save.test.ts`).
- `ui-recording`: tests against a fake `CaptureBrowser`.
- Optional live smoke script (not in CI) driving real Chrome.

## Dependencies

- `puppeteer-core` (runtime). No bundled browser download.
