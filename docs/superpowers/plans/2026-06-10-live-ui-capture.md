# Live UI Capture and Recorder Step Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prompt-driven live web capture path: structured steps execute in real Chrome via CDP, each acted-on element is captured into canonical `UIOBJECT`/`IMAGE`/anchor payloads, and resulting recorder nodes are injected into existing bots through the normalized save pipeline.

**Architecture:** A narrow `CaptureBrowser` interface wraps puppeteer-core (attach to the user's Chrome over `--remote-debugging-port`). Pure modules do the real work: a deterministic element matcher (description → element facts), a target-payload converter (facts → canonical typed values + recorder node JSON), a recording-session orchestrator, and a bot-injection workflow that reuses `saveBotBundle`. Four new MCP tools expose it.

**Tech Stack:** TypeScript ESM, zod v4, vitest, puppeteer-core, existing `src/a360/repository.ts` APIs and `src/workflows/repository-save.ts` normalization.

**Spec:** `docs/superpowers/specs/2026-06-10-live-ui-capture-design.md`

---

### Task 1: Capture types + puppeteer-core dependency

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/capture/types.ts`

- [ ] **Step 1: Install puppeteer-core**

Run: `npm install puppeteer-core`
Expected: `package.json` dependencies gains `"puppeteer-core"`.

- [ ] **Step 2: Create `src/capture/types.ts`**

```ts
export type ElementBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElementFacts = {
  /** Stable id within one page snapshot (e.g. "el-12"). */
  elementId: string;
  /** Accessibility role or tag-derived role ("button", "textbox", "link", ...). */
  role: string;
  /** Accessible name (aria-label, label text, button text, alt, ...). */
  name: string;
  /** Trimmed visible text content (may equal name). */
  text: string;
  /** Lowercase tag name. */
  tag: string;
  /** Best-effort unique CSS path from document root. */
  domPath: string;
  /** Relevant raw attributes: id, name, placeholder, type, href, aria-*, class. */
  attributes: Record<string, string>;
  visible: boolean;
  bounds: ElementBounds;
};

export type CaptureAction = 'navigate' | 'click' | 'type' | 'select';

export type RecordingStepInput = {
  action: CaptureAction;
  /** Natural-language element description, e.g. "Login button". Not used for navigate. */
  target?: string;
  /** Text to type (action "type") or option to select (action "select"). */
  text?: string;
  /** URL for action "navigate". */
  url?: string;
  /** Optional matcher hints. */
  hints?: {
    role?: string;
    exactText?: string;
  };
};

export type CaptureBrowser = {
  gotoUrl: (url: string) => Promise<void>;
  currentUrl: () => Promise<string>;
  snapshotElements: () => Promise<ElementFacts[]>;
  click: (elementId: string) => Promise<void>;
  type: (elementId: string, text: string) => Promise<void>;
  select: (elementId: string, value: string) => Promise<void>;
  /** Returns base64 PNG of the element, or null if it cannot be rasterized. */
  screenshotElement: (elementId: string) => Promise<string | null>;
  close: () => Promise<void>;
};
```

- [ ] **Step 3: Verify compile**

Run: `npm run check`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/capture/types.ts
git commit -m "feat: add capture types and puppeteer-core dependency"
```

---

### Task 2: Deterministic element matcher

**Files:**
- Create: `src/capture/element-matcher.ts`
- Test: `tests/element-matcher.test.ts`

The matcher is pure. It tokenizes the target description, derives a role hint from
role keywords ("button", "link", "field"...), scores every element, and returns an
explicit `matched` / `ambiguous` / `not-found` status. Near-ties are never silently
resolved.

- [ ] **Step 1: Write the failing tests**

Create `tests/element-matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchElement } from '../src/capture/element-matcher.js';
import type { ElementFacts } from '../src/capture/types.js';

function facts(partial: Partial<ElementFacts> & { elementId: string }): ElementFacts {
  return {
    role: 'generic',
    name: '',
    text: '',
    tag: 'div',
    domPath: `body > #${partial.elementId}`,
    attributes: {},
    visible: true,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    ...partial,
  };
}

describe('element matcher', () => {
  it('matches a button by accessible name and role keyword', () => {
    const elements = [
      facts({ elementId: 'el-1', role: 'button', name: 'Login', tag: 'button', text: 'Login' }),
      facts({ elementId: 'el-2', role: 'link', name: 'Help', tag: 'a', text: 'Help' }),
    ];

    const result = matchElement('Login button', elements);

    expect(result.status).toBe('matched');
    expect(result.status === 'matched' && result.element.elementId).toBe('el-1');
  });

  it('matches an input by placeholder when name is empty', () => {
    const elements = [
      facts({
        elementId: 'el-1',
        role: 'textbox',
        tag: 'input',
        attributes: { placeholder: 'Email address', type: 'email' },
      }),
      facts({ elementId: 'el-2', role: 'button', name: 'Submit', tag: 'button', text: 'Submit' }),
    ];

    const result = matchElement('Email field', elements);

    expect(result.status).toBe('matched');
    expect(result.status === 'matched' && result.element.elementId).toBe('el-1');
  });

  it('reports ambiguity with ranked candidates instead of guessing', () => {
    const elements = [
      facts({ elementId: 'el-1', role: 'button', name: 'Save draft', tag: 'button', text: 'Save draft' }),
      facts({ elementId: 'el-2', role: 'button', name: 'Save changes', tag: 'button', text: 'Save changes' }),
    ];

    const result = matchElement('Save button', elements);

    expect(result.status).toBe('ambiguous');
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('disambiguates with the exactText hint', () => {
    const elements = [
      facts({ elementId: 'el-1', role: 'button', name: 'Save draft', tag: 'button', text: 'Save draft' }),
      facts({ elementId: 'el-2', role: 'button', name: 'Save changes', tag: 'button', text: 'Save changes' }),
    ];

    const result = matchElement('Save button', elements, { exactText: 'Save changes' });

    expect(result.status).toBe('matched');
    expect(result.status === 'matched' && result.element.elementId).toBe('el-2');
  });

  it('returns not-found with nearest candidates when nothing scores', () => {
    const elements = [
      facts({ elementId: 'el-1', role: 'link', name: 'Home', tag: 'a', text: 'Home' }),
    ];

    const result = matchElement('Checkout button', elements);

    expect(result.status).toBe('not-found');
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });

  it('prefers visible elements over hidden ones', () => {
    const elements = [
      facts({ elementId: 'el-1', role: 'button', name: 'Login', tag: 'button', text: 'Login', visible: false }),
      facts({ elementId: 'el-2', role: 'button', name: 'Login', tag: 'button', text: 'Login' }),
    ];

    const result = matchElement('Login button', elements);

    expect(result.status).toBe('matched');
    expect(result.status === 'matched' && result.element.elementId).toBe('el-2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/element-matcher.test.ts`
Expected: FAIL — cannot find module `../src/capture/element-matcher.js`.

- [ ] **Step 3: Implement `src/capture/element-matcher.ts`**

```ts
import type { ElementFacts } from './types.js';

export type ScoredCandidate = {
  element: ElementFacts;
  score: number;
};

export type MatchResult =
  | { status: 'matched'; element: ElementFacts; score: number; candidates: ScoredCandidate[] }
  | { status: 'ambiguous'; candidates: ScoredCandidate[] }
  | { status: 'not-found'; candidates: ScoredCandidate[] };

export type MatchHints = {
  role?: string;
  exactText?: string;
};

const ROLE_KEYWORDS: Record<string, string[]> = {
  button: ['button'],
  link: ['link'],
  textbox: ['field', 'input', 'textbox', 'box'],
  checkbox: ['checkbox'],
  radio: ['radio'],
  combobox: ['dropdown', 'select', 'combobox'],
  heading: ['heading', 'title'],
  image: ['image', 'icon', 'logo'],
};

const MIN_MATCH_SCORE = 3;
const AMBIGUITY_GAP = 2;
const MAX_CANDIDATES = 5;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9@.]+/)
    .filter((token) => token.length > 1);
}

function deriveRoleHint(tokens: string[]): string | null {
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((keyword) => tokens.includes(keyword))) {
      return role;
    }
  }
  return null;
}

function isRoleKeywordToken(token: string): boolean {
  return Object.values(ROLE_KEYWORDS).some((keywords) => keywords.includes(token));
}

function scoreElement(
  descriptionTokens: string[],
  roleHint: string | null,
  element: ElementFacts,
): number {
  const nameTokens = tokenize(element.name);
  const textTokens = tokenize(element.text);
  const attributeTokens = tokenize(
    [
      element.attributes.placeholder ?? '',
      element.attributes['aria-label'] ?? '',
      element.attributes.id ?? '',
      element.attributes.name ?? '',
      element.attributes.title ?? '',
    ].join(' '),
  );

  let score = 0;
  for (const token of descriptionTokens) {
    if (isRoleKeywordToken(token)) {
      continue;
    }
    if (nameTokens.includes(token)) {
      score += 3;
    } else if (textTokens.includes(token)) {
      score += 2;
    } else if (attributeTokens.includes(token)) {
      score += 2;
    }
  }

  if (roleHint && element.role === roleHint) {
    score += 3;
  }
  if (element.visible) {
    score += 1;
  } else if (score > 0) {
    score -= 2;
  }

  return score;
}

export function matchElement(
  targetDescription: string,
  elements: ElementFacts[],
  hints: MatchHints = {},
): MatchResult {
  const descriptionTokens = tokenize(targetDescription);
  const roleHint = hints.role ?? deriveRoleHint(descriptionTokens);

  let pool = elements;
  if (hints.exactText) {
    const exact = hints.exactText.trim().toLowerCase();
    const exactPool = elements.filter(
      (element) =>
        element.text.trim().toLowerCase() === exact ||
        element.name.trim().toLowerCase() === exact,
    );
    if (exactPool.length > 0) {
      pool = exactPool;
    }
  }

  const ranked: ScoredCandidate[] = pool
    .map((element) => ({ element, score: scoreElement(descriptionTokens, roleHint, element) }))
    .sort((a, b) => b.score - a.score);

  const candidates = ranked.slice(0, MAX_CANDIDATES);
  const best = ranked[0];

  if (!best || best.score < MIN_MATCH_SCORE) {
    return { status: 'not-found', candidates };
  }

  const second = ranked[1];
  if (second && best.score - second.score < AMBIGUITY_GAP) {
    return { status: 'ambiguous', candidates };
  }

  return { status: 'matched', element: best.element, score: best.score, candidates };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/element-matcher.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/capture/element-matcher.ts tests/element-matcher.test.ts
git commit -m "feat: add deterministic element matcher for live UI capture"
```

---

### Task 3: Target payload converter + recorder node builder

**Files:**
- Create: `src/capture/target-payload.ts`
- Test: `tests/target-payload.test.ts`

The converter is pure: element facts → canonical `UIOBJECT` (criteria as an object
map, the pre-normalization shape that `normalizeTypedValue` in
`src/workflows/repository-save.ts` converts into the saved key/value array),
optional `IMAGE`, optional anchor `DICTIONARY`, plus a ready Recorder-package node.

**Grounding note for the recorder command identity:** before writing the
implementation, grep the local research and migration assets for the real recorder
node shape:

Run: `grep -ri "Recorder" "docs/research" --include="*.js" --include="*.ts" -l | head` and inspect any migration `mapping_data.json` nearby (see `src/workflows/migration-grounding.ts` for the search roots). If a concrete saved recorder node is found, set the constants below to those names. If not found, keep the defaults below — they are explicitly overridable per call via `RecorderNodeOptions`, and `a360_get_package_command_schema` can verify them at runtime.

- [ ] **Step 1: Write the failing tests**

Create `tests/target-payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildCapturedTargetPayload,
  buildRecorderNode,
} from '../src/capture/target-payload.js';
import type { ElementFacts } from '../src/capture/types.js';

const LOGIN_BUTTON: ElementFacts = {
  elementId: 'el-1',
  role: 'button',
  name: 'Login',
  text: 'Login',
  tag: 'button',
  domPath: 'body > form > button#login',
  attributes: { id: 'login', class: 'btn primary' },
  visible: true,
  bounds: { x: 10, y: 20, width: 80, height: 30 },
};

describe('target payload converter', () => {
  it('builds a canonical UIOBJECT with capture and criteria from element facts', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);

    expect(payload.uiObject.type).toBe('UIOBJECT');
    const uiObject = payload.uiObject.uiObject as Record<string, any>;
    expect(uiObject.capture).toEqual({ securelyRecorded: true });
    expect(uiObject.criteria.title).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'Login' },
    });
    expect(uiObject.criteria.role).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'button' },
    });
    expect(uiObject.criteria.domPath).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'body > form > button#login' },
    });
    expect(uiObject.criteria.tag).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'button' },
    });
  });

  it('includes an IMAGE typed value when a screenshot is provided', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON, {
      screenshotBase64: 'aGVsbG8=',
    });

    expect(payload.image).toEqual({
      type: 'IMAGE',
      image: 'aGVsbG8=',
      securelyRecorded: true,
    });
  });

  it('omits IMAGE when no screenshot is provided', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    expect(payload.image).toBeUndefined();
  });

  it('builds an anchor DICTIONARY naming the target', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON, { includeAnchor: true });

    expect(payload.anchor).toEqual({
      type: 'DICTIONARY',
      dictionary: [{ key: 'name', value: { type: 'STRING', string: 'Login' } }],
    });
  });

  it('builds a recorder node carrying the captured target and action', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, { action: 'click' });

    expect(node.packageName).toBe('Recorder');
    expect(node.commandName).toBe('Capture');
    expect(node.disabled).toBe(false);
    expect(typeof node.uid).toBe('string');

    const attributes = node.attributes as Array<{ name: string; value: any }>;
    const targetAttr = attributes.find((a) => a.value?.type === 'UIOBJECT');
    const actionAttr = attributes.find((a) => a.name === 'action');
    expect(targetAttr).toBeDefined();
    expect(actionAttr?.value).toEqual({ type: 'STRING', string: 'CLICK' });
  });

  it('carries the typed text as the action value for type actions', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, { action: 'type', text: 'hello@example.com' });

    const attributes = node.attributes as Array<{ name: string; value: any }>;
    const valueAttr = attributes.find((a) => a.name === 'actionValue');
    expect(valueAttr?.value).toEqual({ type: 'STRING', string: 'hello@example.com' });
  });

  it('honors recorder command identity overrides', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, {
      action: 'click',
      packageName: 'UniversalRecorder',
      commandName: 'CaptureObject',
      targetAttributeName: 'objectDetails',
    });

    expect(node.packageName).toBe('UniversalRecorder');
    expect(node.commandName).toBe('CaptureObject');
    const attributes = node.attributes as Array<{ name: string; value: any }>;
    expect(attributes.find((a) => a.name === 'objectDetails')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/target-payload.test.ts`
Expected: FAIL — cannot find module `../src/capture/target-payload.js`.

- [ ] **Step 3: Implement `src/capture/target-payload.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { CaptureAction, ElementFacts } from './types.js';

type TypedValue = Record<string, unknown> & { type: string };

export type CapturedTargetPayload = {
  uiObject: TypedValue;
  image?: TypedValue;
  anchor?: TypedValue;
  sourceFacts: ElementFacts;
};

export type BuildPayloadOptions = {
  screenshotBase64?: string;
  includeAnchor?: boolean;
};

export type RecorderNodeOptions = {
  action: Exclude<CaptureAction, 'navigate'>;
  text?: string;
  uid?: string;
  /** Recorder command identity. Defaults assume the Recorder package Capture
   *  command; verify with a360_get_package_command_schema and override if the
   *  Control Room schema differs. */
  packageName?: string;
  commandName?: string;
  targetAttributeName?: string;
  actionAttributeName?: string;
  actionValueAttributeName?: string;
};

const ACTION_NAMES: Record<Exclude<CaptureAction, 'navigate'>, string> = {
  click: 'CLICK',
  type: 'SET_TEXT',
  select: 'SELECT_ITEM_BY_TEXT',
};

function stringValue(value: string): TypedValue {
  return { type: 'STRING', string: value };
}

function criterion(value: string) {
  return {
    enabled: true,
    value: stringValue(value),
  };
}

export function buildCapturedTargetPayload(
  facts: ElementFacts,
  options: BuildPayloadOptions = {},
): CapturedTargetPayload {
  const title = facts.name || facts.text;

  const criteria: Record<string, unknown> = {
    domPath: criterion(facts.domPath),
    tag: criterion(facts.tag),
    role: criterion(facts.role),
  };
  if (title) {
    criteria.title = criterion(title);
  }
  if (facts.attributes.id) {
    criteria.id = criterion(facts.attributes.id);
  }
  if (facts.attributes.name) {
    criteria.name = criterion(facts.attributes.name);
  }

  const payload: CapturedTargetPayload = {
    uiObject: {
      type: 'UIOBJECT',
      uiObject: {
        capture: { securelyRecorded: true },
        criteria,
      },
    },
    sourceFacts: facts,
  };

  if (options.screenshotBase64) {
    payload.image = {
      type: 'IMAGE',
      image: options.screenshotBase64,
      securelyRecorded: true,
    };
  }

  if (options.includeAnchor) {
    payload.anchor = {
      type: 'DICTIONARY',
      dictionary: [{ key: 'name', value: stringValue(title || facts.tag) }],
    };
  }

  return payload;
}

export function buildRecorderNode(
  payload: CapturedTargetPayload,
  options: RecorderNodeOptions,
): Record<string, unknown> {
  const targetAttributeName = options.targetAttributeName ?? 'objectProps';
  const actionAttributeName = options.actionAttributeName ?? 'action';
  const actionValueAttributeName = options.actionValueAttributeName ?? 'actionValue';

  const attributes: Array<{ name: string; value: unknown }> = [
    { name: targetAttributeName, value: payload.uiObject },
    { name: actionAttributeName, value: stringValue(ACTION_NAMES[options.action]) },
  ];

  if (options.action === 'type' || options.action === 'select') {
    attributes.push({
      name: actionValueAttributeName,
      value: stringValue(options.text ?? ''),
    });
  }
  if (payload.image) {
    attributes.push({ name: 'image', value: payload.image });
  }
  if (payload.anchor) {
    attributes.push({ name: 'anchor', value: payload.anchor });
  }

  return {
    uid: options.uid ?? randomUUID(),
    packageName: options.packageName ?? 'Recorder',
    commandName: options.commandName ?? 'Capture',
    disabled: false,
    attributes,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/target-payload.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Verify save-pipeline compatibility**

Add this test to `tests/target-payload.test.ts` (it proves the produced shape
survives the real save normalization):

```ts
import { normalizeTaskBotContentForSave } from '../src/workflows/repository-save.js';

describe('save pipeline compatibility', () => {
  it('captured payloads normalize cleanly through the save pipeline', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, { action: 'click' });

    const normalized = normalizeTaskBotContentForSave({
      nodes: [node],
      properties: { botCodeVersion: '5' },
    });

    const savedNode = normalized.nodes[0] as Record<string, any>;
    const target = savedNode.attributes.find((a: any) => a.value?.type === 'UIOBJECT');
    expect(Array.isArray(target.value.uiObject.criteria)).toBe(true);
    expect(target.value.uiObject.capture).toEqual({ securelyRecorded: true });
  });
});
```

Run: `npx vitest run tests/target-payload.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/capture/target-payload.ts tests/target-payload.test.ts
git commit -m "feat: convert captured element facts into canonical A360 target payloads"
```

---

### Task 4: Recording session orchestrator

**Files:**
- Create: `src/workflows/ui-recording.ts`
- Test: `tests/ui-recording.test.ts`

The orchestrator drives a `CaptureBrowser` (faked in tests): per step it snapshots,
matches, acts, captures, and builds payload + node. Ambiguity/not-found halts the
session and returns partial progress with candidates.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui-recording.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recordWebActions } from '../src/workflows/ui-recording.js';
import type { CaptureBrowser, ElementFacts } from '../src/capture/types.js';

function facts(partial: Partial<ElementFacts> & { elementId: string }): ElementFacts {
  return {
    role: 'generic',
    name: '',
    text: '',
    tag: 'div',
    domPath: `body > #${partial.elementId}`,
    attributes: {},
    visible: true,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    ...partial,
  };
}

function fakeBrowser(elements: ElementFacts[]): CaptureBrowser & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    gotoUrl: async (url) => {
      log.push(`goto:${url}`);
    },
    currentUrl: async () => 'https://example.test/page',
    snapshotElements: async () => elements,
    click: async (elementId) => {
      log.push(`click:${elementId}`);
    },
    type: async (elementId, text) => {
      log.push(`type:${elementId}:${text}`);
    },
    select: async (elementId, value) => {
      log.push(`select:${elementId}:${value}`);
    },
    screenshotElement: async () => 'aW1n',
    close: async () => {
      log.push('close');
    },
  };
}

const PAGE = [
  facts({ elementId: 'el-1', role: 'textbox', tag: 'input', attributes: { placeholder: 'Email address' } }),
  facts({ elementId: 'el-2', role: 'button', name: 'Login', tag: 'button', text: 'Login' }),
];

describe('ui recording session', () => {
  it('executes structured steps and captures payloads per step', async () => {
    const browser = fakeBrowser(PAGE);

    const session = await recordWebActions(browser, {
      startUrl: 'https://example.test/login',
      steps: [
        { action: 'type', target: 'Email field', text: 'a@b.com' },
        { action: 'click', target: 'Login button' },
      ],
    });

    expect(session.status).toBe('completed');
    expect(session.steps).toHaveLength(2);
    expect(browser.log).toContain('goto:https://example.test/login');
    expect(browser.log).toContain('type:el-1:a@b.com');
    expect(browser.log).toContain('click:el-2');

    const first = session.steps[0];
    expect(first.status).toBe('captured');
    expect(first.payload?.uiObject.type).toBe('UIOBJECT');
    expect(first.node?.packageName).toBe('Recorder');
    expect(first.pageUrl).toBe('https://example.test/page');
  });

  it('captures element screenshots when captureImages is set', async () => {
    const browser = fakeBrowser(PAGE);

    const session = await recordWebActions(browser, {
      startUrl: 'https://example.test/login',
      steps: [{ action: 'click', target: 'Login button' }],
      captureImages: true,
    });

    expect(session.steps[0].payload?.image).toEqual({
      type: 'IMAGE',
      image: 'aW1n',
      securelyRecorded: true,
    });
  });

  it('halts on ambiguity and returns partial progress with candidates', async () => {
    const browser = fakeBrowser([
      facts({ elementId: 'el-1', role: 'button', name: 'Save draft', tag: 'button', text: 'Save draft' }),
      facts({ elementId: 'el-2', role: 'button', name: 'Save changes', tag: 'button', text: 'Save changes' }),
    ]);

    const session = await recordWebActions(browser, {
      startUrl: 'https://example.test/editor',
      steps: [
        { action: 'click', target: 'Save button' },
        { action: 'click', target: 'Close button' },
      ],
    });

    expect(session.status).toBe('halted');
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0].status).toBe('ambiguous');
    expect(session.steps[0].candidates?.length).toBeGreaterThanOrEqual(2);
    expect(browser.log.filter((entry) => entry.startsWith('click:'))).toHaveLength(0);
  });

  it('supports navigate steps without a target', async () => {
    const browser = fakeBrowser(PAGE);

    const session = await recordWebActions(browser, {
      startUrl: 'https://example.test/a',
      steps: [
        { action: 'navigate', url: 'https://example.test/b' },
        { action: 'click', target: 'Login button' },
      ],
    });

    expect(session.status).toBe('completed');
    expect(browser.log).toContain('goto:https://example.test/b');
    expect(session.steps[0].status).toBe('navigated');
  });

  it('rejects action steps missing a target up front', async () => {
    const browser = fakeBrowser(PAGE);

    const session = await recordWebActions(browser, {
      startUrl: 'https://example.test/a',
      steps: [{ action: 'click' }],
    });

    expect(session.status).toBe('halted');
    expect(session.steps[0].status).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui-recording.test.ts`
Expected: FAIL — cannot find module `../src/workflows/ui-recording.js`.

- [ ] **Step 3: Implement `src/workflows/ui-recording.ts`**

```ts
import { matchElement, type ScoredCandidate } from '../capture/element-matcher.js';
import {
  buildCapturedTargetPayload,
  buildRecorderNode,
  type CapturedTargetPayload,
  type RecorderNodeOptions,
} from '../capture/target-payload.js';
import type { CaptureBrowser, RecordingStepInput } from '../capture/types.js';

export type RecordingStepResult = {
  input: RecordingStepInput;
  status: 'captured' | 'navigated' | 'ambiguous' | 'not-found' | 'error';
  pageUrl?: string;
  payload?: CapturedTargetPayload;
  node?: Record<string, unknown>;
  candidates?: ScoredCandidate[];
  error?: string;
};

export type RecordingSessionResult = {
  status: 'completed' | 'halted';
  steps: RecordingStepResult[];
};

export type RecordWebActionsInput = {
  startUrl: string;
  steps: RecordingStepInput[];
  captureImages?: boolean;
  includeAnchors?: boolean;
  recorderCommand?: Pick<
    RecorderNodeOptions,
    | 'packageName'
    | 'commandName'
    | 'targetAttributeName'
    | 'actionAttributeName'
    | 'actionValueAttributeName'
  >;
};

export async function recordWebActions(
  browser: CaptureBrowser,
  input: RecordWebActionsInput,
): Promise<RecordingSessionResult> {
  const results: RecordingStepResult[] = [];

  await browser.gotoUrl(input.startUrl);

  for (const step of input.steps) {
    if (step.action === 'navigate') {
      if (!step.url) {
        results.push({ input: step, status: 'error', error: 'navigate step requires url' });
        return { status: 'halted', steps: results };
      }
      await browser.gotoUrl(step.url);
      results.push({ input: step, status: 'navigated', pageUrl: step.url });
      continue;
    }

    if (!step.target) {
      results.push({
        input: step,
        status: 'error',
        error: `${step.action} step requires a target description`,
      });
      return { status: 'halted', steps: results };
    }

    const pageUrl = await browser.currentUrl();
    const elements = await browser.snapshotElements();
    const match = matchElement(step.target, elements, step.hints);

    if (match.status !== 'matched') {
      results.push({
        input: step,
        status: match.status,
        pageUrl,
        candidates: match.candidates,
      });
      return { status: 'halted', steps: results };
    }

    try {
      const screenshotBase64 = input.captureImages
        ? ((await browser.screenshotElement(match.element.elementId)) ?? undefined)
        : undefined;

      if (step.action === 'click') {
        await browser.click(match.element.elementId);
      } else if (step.action === 'type') {
        await browser.type(match.element.elementId, step.text ?? '');
      } else {
        await browser.select(match.element.elementId, step.text ?? '');
      }

      const payload = buildCapturedTargetPayload(match.element, {
        screenshotBase64,
        includeAnchor: input.includeAnchors,
      });
      const node = buildRecorderNode(payload, {
        action: step.action,
        text: step.text,
        ...input.recorderCommand,
      });

      results.push({ input: step, status: 'captured', pageUrl, payload, node });
    } catch (error) {
      results.push({
        input: step,
        status: 'error',
        pageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'halted', steps: results };
    }
  }

  return { status: 'completed', steps: results };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui-recording.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/ui-recording.ts tests/ui-recording.test.ts
git commit -m "feat: add live web recording session orchestrator"
```

---

### Task 5: Chrome CDP session (puppeteer-core implementation)

**Files:**
- Create: `src/capture/chrome-session.ts`
- Create: `scripts/smoke-capture.mjs` (manual smoke, not in CI)

No unit tests for this module — it is the thin I/O shell behind `CaptureBrowser`;
everything above it is already tested against fakes. Verification is `npm run check`
plus the manual smoke script.

- [ ] **Step 1: Implement `src/capture/chrome-session.ts`**

```ts
import puppeteer, { type Browser, type Page, type ElementHandle } from 'puppeteer-core';
import type { CaptureBrowser, ElementFacts } from './types.js';

export type ChromeSessionOptions = {
  /** DevTools endpoint, e.g. "http://127.0.0.1:9222". */
  browserUrl?: string;
};

const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222';

const SETUP_HELP =
  'Could not reach Chrome DevTools. Start Chrome with a debugging port, e.g.:\n' +
  '  chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\a360-capture-profile\n' +
  'or set A360_MCP_CHROME_ENDPOINT to an existing DevTools URL.';

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role]',
  '[onclick]',
  'label',
  'img[alt]',
  'h1, h2, h3',
].join(', ');

type RawElementFacts = Omit<ElementFacts, 'elementId'>;

export async function connectChromeSession(
  options: ChromeSessionOptions = {},
): Promise<CaptureBrowser> {
  const browserURL =
    options.browserUrl ?? process.env.A360_MCP_CHROME_ENDPOINT ?? DEFAULT_BROWSER_URL;

  let browser: Browser;
  try {
    browser = await puppeteer.connect({ browserURL, defaultViewport: null });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${SETUP_HELP}\n\nUnderlying error: ${reason}`);
  }

  const pages = await browser.pages();
  const page: Page = pages.find((candidate) => candidate.url() !== 'about:blank') ?? pages[0]
    ?? (await browser.newPage());

  let handles = new Map<string, ElementHandle>();

  async function snapshotElements(): Promise<ElementFacts[]> {
    for (const handle of handles.values()) {
      await handle.dispose().catch(() => {});
    }
    handles = new Map();

    const elementHandles = await page.$$(INTERACTIVE_SELECTOR);
    const facts: ElementFacts[] = [];

    for (const [index, handle] of elementHandles.entries()) {
      const raw = await handle.evaluate((element): RawElementFacts => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none';

        const attributes: Record<string, string> = {};
        for (const name of ['id', 'name', 'placeholder', 'type', 'href', 'title', 'class', 'aria-label', 'alt', 'role']) {
          const value = htmlElement.getAttribute(name);
          if (value) {
            attributes[name] = value;
          }
        }

        const tag = htmlElement.tagName.toLowerCase();
        const implicitRoles: Record<string, string> = {
          a: 'link',
          button: 'button',
          input: 'textbox',
          textarea: 'textbox',
          select: 'combobox',
          img: 'image',
          h1: 'heading',
          h2: 'heading',
          h3: 'heading',
        };
        const inputType = (htmlElement.getAttribute('type') ?? '').toLowerCase();
        let role = attributes.role ?? implicitRoles[tag] ?? 'generic';
        if (tag === 'input' && ['button', 'submit', 'reset'].includes(inputType)) {
          role = 'button';
        }
        if (tag === 'input' && ['checkbox', 'radio'].includes(inputType)) {
          role = inputType;
        }

        const text = (htmlElement.innerText ?? htmlElement.textContent ?? '')
          .trim()
          .slice(0, 200);
        const labelText =
          htmlElement.labels && htmlElement.labels.length > 0
            ? (htmlElement.labels[0] as HTMLElement).innerText.trim()
            : '';
        const name =
          attributes['aria-label'] ?? labelText ?? '';

        const pathParts: string[] = [];
        let current: Element | null = htmlElement;
        while (current && current !== document.body && pathParts.length < 12) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part += `#${current.id}`;
            pathParts.unshift(part);
            break;
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (sibling) => sibling.tagName === current!.tagName,
            );
            if (siblings.length > 1) {
              part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }
          pathParts.unshift(part);
          current = parent;
        }

        return {
          role,
          name: name || (tag === 'button' || role === 'button' || role === 'link' ? text : ''),
          text,
          tag,
          domPath: ['body', ...pathParts].join(' > '),
          attributes,
          visible,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });

      const elementId = `el-${index + 1}`;
      handles.set(elementId, handle);
      facts.push({ elementId, ...raw });
    }

    return facts;
  }

  function requireHandle(elementId: string): ElementHandle {
    const handle = handles.get(elementId);
    if (!handle) {
      throw new Error(
        `Unknown elementId "${elementId}" — the page snapshot is stale; re-run snapshotElements.`,
      );
    }
    return handle;
  }

  return {
    gotoUrl: async (url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    currentUrl: async () => page.url(),
    snapshotElements,
    click: async (elementId) => {
      await requireHandle(elementId).click();
    },
    type: async (elementId, text) => {
      const handle = requireHandle(elementId);
      await handle.click({ clickCount: 3 });
      await handle.type(text);
    },
    select: async (elementId, value) => {
      const handle = requireHandle(elementId);
      await handle.select(value);
    },
    screenshotElement: async (elementId) => {
      try {
        const data = await requireHandle(elementId).screenshot({ encoding: 'base64' });
        return typeof data === 'string' ? data : null;
      } catch {
        return null;
      }
    },
    close: async () => {
      await browser.disconnect();
    },
  };
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run check`
Expected: PASS. If puppeteer-core types complain about `htmlElement.labels`, cast:
`const htmlElement = element as HTMLInputElement;` (labels exists on form
elements; the broader cast is acceptable inside `evaluate`).

- [ ] **Step 3: Create the manual smoke script `scripts/smoke-capture.mjs`**

```js
// Manual smoke: requires Chrome started with --remote-debugging-port=9222.
// Usage: node scripts/smoke-capture.mjs https://example.com "More information link"
import { connectChromeSession } from '../dist/src/capture/chrome-session.js';
import { matchElement } from '../dist/src/capture/element-matcher.js';
import { buildCapturedTargetPayload } from '../dist/src/capture/target-payload.js';

const [url = 'https://example.com', target = 'More information link'] = process.argv.slice(2);

const browser = await connectChromeSession();
await browser.gotoUrl(url);
const elements = await browser.snapshotElements();
console.log(`snapshot: ${elements.length} elements`);

const match = matchElement(target, elements);
console.log(`match status: ${match.status}`);
if (match.status === 'matched') {
  const payload = buildCapturedTargetPayload(match.element);
  console.log(JSON.stringify(payload.uiObject, null, 2));
} else {
  console.log(JSON.stringify(match.candidates.map((c) => ({ score: c.score, name: c.element.name, text: c.element.text })), null, 2));
}
await browser.close();
```

Run (manual only, requires Chrome with debug port + `npm run build` first):
`npm run build && node scripts/smoke-capture.mjs`
Expected: prints element count, `match status: matched`, and a canonical UIOBJECT.

- [ ] **Step 4: Commit**

```bash
git add src/capture/chrome-session.ts scripts/smoke-capture.mjs
git commit -m "feat: add Chrome CDP capture session via puppeteer-core"
```

---

### Task 6: Bot injection workflow

**Files:**
- Create: `src/workflows/bot-injection.ts`
- Test: `tests/bot-injection.test.ts`

`insertRecorderSteps` fetches the bot content, inserts nodes (append, by index, or
after a node uid), ensures the Recorder package entry exists, and saves through the
existing `saveBotBundle`. `patchStepTarget` replaces one attribute's typed value on
an existing node and saves.

- [ ] **Step 1: Write the failing tests**

Create `tests/bot-injection.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { insertRecorderSteps, patchStepTarget } from '../src/workflows/bot-injection.js';

const EXISTING_CONTENT = {
  triggers: [],
  nodes: [
    {
      uid: 'existing-1',
      packageName: 'MessageBox',
      commandName: 'messageBox',
      disabled: false,
      attributes: [
        { name: 'message', value: { type: 'STRING', string: 'hello' } },
      ],
    },
  ],
  variables: [],
  packages: [{ name: 'MessageBox', version: '1.0.0', settingsAttributes: [] }],
  properties: {
    botCodeVersion: '5',
    improvedNumberSupport: true,
    timeout: '0s',
    automationPriority: 'PRIORITY_MEDIUM',
    runInChildWindow: false,
    runInChildWindowMode: 'DESKTOP',
  },
  workItemTemplateName: null,
};

const RECORDER_NODE = {
  uid: 'rec-1',
  packageName: 'Recorder',
  commandName: 'Capture',
  disabled: false,
  attributes: [
    {
      name: 'objectProps',
      value: {
        type: 'UIOBJECT',
        uiObject: {
          capture: { securelyRecorded: true },
          criteria: {
            title: { enabled: true, value: { type: 'STRING', string: 'Login' } },
          },
        },
      },
    },
    { name: 'action', value: { type: 'STRING', string: 'CLICK' } },
  ],
};

function fakeApi(content: Record<string, unknown> = EXISTING_CONTENT) {
  return {
    getFileContent: vi.fn().mockResolvedValue(structuredClone(content)),
    getFileDependencies: vi.fn().mockResolvedValue({ dependencies: [] }),
    updateFileContent: vi.fn().mockResolvedValue({ ok: true }),
    updateFileDependencies: vi.fn().mockResolvedValue('OK'),
  };
}

describe('insertRecorderSteps', () => {
  it('appends nodes, adds the Recorder package, and saves via the bundle flow', async () => {
    const api = fakeApi();

    const result = await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    expect(api.getFileContent).toHaveBeenCalledWith('42');
    expect(api.updateFileContent).toHaveBeenCalledTimes(1);

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    expect(saved.nodes).toHaveLength(2);
    expect(saved.nodes[1].uid).toBe('rec-1');
    expect(saved.packages.map((p: any) => p.name)).toContain('Recorder');
    expect(result.insertedUids).toEqual(['rec-1']);
  });

  it('inserts after a given node uid', async () => {
    const api = fakeApi();

    await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      afterUid: 'existing-1',
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    expect(saved.nodes.map((n: any) => n.uid)).toEqual(['existing-1', 'rec-1']);
  });

  it('fails when afterUid does not exist', async () => {
    const api = fakeApi();

    await expect(
      insertRecorderSteps(api, {
        fileId: '42',
        nodes: [RECORDER_NODE],
        afterUid: 'missing',
        recorderPackage: { name: 'Recorder', version: '2.5.0' },
      }),
    ).rejects.toThrow(/afterUid "missing" not found/);
  });

  it('does not duplicate an existing Recorder package entry', async () => {
    const content = structuredClone(EXISTING_CONTENT) as Record<string, any>;
    content.packages.push({ name: 'Recorder', version: '2.4.0', settingsAttributes: [] });
    const api = fakeApi(content);

    await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    const recorderEntries = saved.packages.filter((p: any) => p.name === 'Recorder');
    expect(recorderEntries).toHaveLength(1);
    expect(recorderEntries[0].version).toBe('2.4.0');
  });

  it('requires recorderPackage when the bot lacks a Recorder entry', async () => {
    const api = fakeApi();

    await expect(
      insertRecorderSteps(api, { fileId: '42', nodes: [RECORDER_NODE] }),
    ).rejects.toThrow(/recorderPackage/);
  });
});

describe('patchStepTarget', () => {
  it('replaces the named attribute value on the target node and saves', async () => {
    const content = structuredClone(EXISTING_CONTENT) as Record<string, any>;
    content.nodes.push(structuredClone(RECORDER_NODE));
    const api = fakeApi(content);

    const newTarget = {
      type: 'UIOBJECT',
      uiObject: {
        capture: { securelyRecorded: true },
        criteria: {
          title: { enabled: true, value: { type: 'STRING', string: 'Submit' } },
        },
      },
    };

    await patchStepTarget(api, {
      fileId: '42',
      nodeUid: 'rec-1',
      attributeName: 'objectProps',
      value: newTarget,
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    const node = saved.nodes.find((n: any) => n.uid === 'rec-1');
    const attribute = node.attributes.find((a: any) => a.name === 'objectProps');
    const criteria = attribute.value.uiObject.criteria;
    expect(criteria[0].value.value.string).toBe('Submit');
  });

  it('fails when the node uid is missing', async () => {
    const api = fakeApi();

    await expect(
      patchStepTarget(api, {
        fileId: '42',
        nodeUid: 'missing',
        attributeName: 'objectProps',
        value: { type: 'UIOBJECT' },
      }),
    ).rejects.toThrow(/node uid "missing" not found/);
  });

  it('fails when the attribute is missing on the node', async () => {
    const api = fakeApi();

    await expect(
      patchStepTarget(api, {
        fileId: '42',
        nodeUid: 'existing-1',
        attributeName: 'objectProps',
        value: { type: 'UIOBJECT' },
      }),
    ).rejects.toThrow(/attribute "objectProps" not found/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bot-injection.test.ts`
Expected: FAIL — cannot find module `../src/workflows/bot-injection.js`.

- [ ] **Step 3: Implement `src/workflows/bot-injection.ts`**

```ts
import { saveBotBundle } from './repository-save.js';

type BotInjectionApi = {
  getFileContent: (fileId: string) => Promise<unknown>;
  getFileDependencies: (fileId: string) => Promise<unknown>;
  updateFileContent: (
    fileId: string,
    content: Record<string, unknown>,
    hasErrors?: boolean,
  ) => Promise<unknown>;
  updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
};

type BotNode = Record<string, unknown> & { uid?: unknown };

function asContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bot content payload is not an object.');
  }
  return value as Record<string, unknown>;
}

function getNodes(content: Record<string, unknown>): BotNode[] {
  return Array.isArray(content.nodes) ? (content.nodes as BotNode[]) : [];
}

export type InsertRecorderStepsInput = {
  fileId: string;
  nodes: Array<Record<string, unknown>>;
  /** Insert after this node uid; appends to the end when omitted. */
  afterUid?: string;
  /** Required when the bot does not already reference the recorder package. */
  recorderPackage?: { name: string; version: string };
  hasErrors?: boolean;
};

export async function insertRecorderSteps(
  api: BotInjectionApi,
  input: InsertRecorderStepsInput,
) {
  const content = asContent(await api.getFileContent(input.fileId));
  const nodes = [...getNodes(content)];

  let insertAt = nodes.length;
  if (input.afterUid !== undefined) {
    const index = nodes.findIndex((node) => node.uid === input.afterUid);
    if (index === -1) {
      throw new Error(`afterUid "${input.afterUid}" not found in bot ${input.fileId}.`);
    }
    insertAt = index + 1;
  }
  nodes.splice(insertAt, 0, ...input.nodes);
  content.nodes = nodes;

  const packages = Array.isArray(content.packages)
    ? ([...content.packages] as Array<Record<string, unknown>>)
    : [];
  const recorderPackageNames = new Set(
    input.nodes
      .map((node) => node.packageName)
      .filter((name): name is string => typeof name === 'string'),
  );

  for (const packageName of recorderPackageNames) {
    const exists = packages.some((entry) => entry.name === packageName);
    if (exists) {
      continue;
    }
    if (!input.recorderPackage || input.recorderPackage.name !== packageName) {
      throw new Error(
        `Bot ${input.fileId} does not reference package "${packageName}". ` +
          'Pass recorderPackage {name, version} so the dependency can be added.',
      );
    }
    packages.push({
      name: input.recorderPackage.name,
      version: input.recorderPackage.version,
      settingsAttributes: [],
    });
  }
  content.packages = packages;

  const dependencies = await api.getFileDependencies(input.fileId);
  const saveResult = await saveBotBundle(api, {
    fileId: input.fileId,
    content,
    dependencies: dependencies as Record<string, unknown> | undefined as never,
    hasErrors: input.hasErrors,
  });

  return {
    insertedUids: input.nodes.map((node) => String(node.uid ?? '')),
    nodeCount: nodes.length,
    saveResult,
  };
}

export type PatchStepTargetInput = {
  fileId: string;
  nodeUid: string;
  attributeName: string;
  value: Record<string, unknown>;
  hasErrors?: boolean;
};

export async function patchStepTarget(api: BotInjectionApi, input: PatchStepTargetInput) {
  const content = asContent(await api.getFileContent(input.fileId));
  const nodes = getNodes(content);

  const node = nodes.find((candidate) => candidate.uid === input.nodeUid);
  if (!node) {
    throw new Error(`node uid "${input.nodeUid}" not found in bot ${input.fileId}.`);
  }

  const attributes = Array.isArray(node.attributes)
    ? (node.attributes as Array<Record<string, unknown>>)
    : [];
  const attribute = attributes.find((candidate) => candidate.name === input.attributeName);
  if (!attribute) {
    throw new Error(
      `attribute "${input.attributeName}" not found on node "${input.nodeUid}".`,
    );
  }
  attribute.value = input.value;

  const dependencies = await api.getFileDependencies(input.fileId);
  const saveResult = await saveBotBundle(api, {
    fileId: input.fileId,
    content,
    dependencies: dependencies as Record<string, unknown> | undefined as never,
    hasErrors: input.hasErrors,
  });

  return { patchedUid: input.nodeUid, saveResult };
}
```

Note: `saveBotBundle`'s `dependencies` parameter accepts the
`{dependencies: [...]}` object shape already (see `normalizeDependencyIdsForSave`).
If the `as never` cast is rejected by `npm run check`, type the local as
`const dependencies = (await api.getFileDependencies(input.fileId)) as { dependencies?: Array<{ id?: string | number | null }> };`
and pass it directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bot-injection.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/bot-injection.ts tests/bot-injection.test.ts
git commit -m "feat: add recorder step injection and target patching workflows"
```

---

### Task 7: MCP tools + server wiring

**Files:**
- Create: `src/tools/capture.ts`
- Modify: `src/tools/index.ts` (export the new register function)
- Modify: `src/server.ts` (wire `captureApi` deps + register tools)
- Test: `tests/server.test.ts` (extend the existing tool-listing assertions)

- [ ] **Step 1: Extend the server test**

Open `tests/server.test.ts`, find where registered tool names are asserted, and add
the four new names to the expected list:

```ts
'a360_record_web_actions',
'a360_capture_ui_target',
'a360_insert_recorder_step',
'a360_patch_step_target',
```

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — the new tool names are not registered yet.

- [ ] **Step 2: Create `src/tools/capture.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const stepSchema = z.object({
  action: z.enum(['navigate', 'click', 'type', 'select']),
  target: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  hints: z
    .object({
      role: z.string().optional(),
      exactText: z.string().optional(),
    })
    .optional(),
});

const recorderCommandSchema = z
  .object({
    packageName: z.string().optional(),
    commandName: z.string().optional(),
    targetAttributeName: z.string().optional(),
    actionAttributeName: z.string().optional(),
    actionValueAttributeName: z.string().optional(),
  })
  .optional();

type CaptureDeps = {
  captureApi: {
    recordWebActions: (input: {
      startUrl: string;
      steps: Array<z.infer<typeof stepSchema>>;
      captureImages?: boolean;
      includeAnchors?: boolean;
      recorderCommand?: z.infer<typeof recorderCommandSchema>;
      browserUrl?: string;
    }) => Promise<unknown>;
    captureUiTarget: (input: {
      url: string;
      target: string;
      hints?: { role?: string; exactText?: string };
      captureImage?: boolean;
      includeAnchor?: boolean;
      browserUrl?: string;
    }) => Promise<unknown>;
    insertRecorderSteps: (input: {
      fileId: string;
      nodes: Array<Record<string, unknown>>;
      afterUid?: string;
      recorderPackage?: { name: string; version: string };
      hasErrors?: boolean;
    }) => Promise<unknown>;
    patchStepTarget: (input: {
      fileId: string;
      nodeUid: string;
      attributeName: string;
      value: Record<string, unknown>;
      hasErrors?: boolean;
    }) => Promise<unknown>;
  };
};

export function registerCaptureTools(server: McpServer, deps: CaptureDeps) {
  server.registerTool(
    'a360_record_web_actions',
    {
      description:
        'Run a live web recording session in Chrome over CDP: execute structured steps (navigate/click/type/select), capture each acted-on element, and return canonical UIOBJECT/IMAGE payloads plus ready recorder nodes. Halts with ranked candidates on ambiguity.',
      inputSchema: z.object({
        startUrl: z.string().min(1),
        steps: z.array(stepSchema).min(1),
        captureImages: z.boolean().optional(),
        includeAnchors: z.boolean().optional(),
        recorderCommand: recorderCommandSchema,
        browserUrl: z.string().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.recordWebActions(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_capture_ui_target',
    {
      description:
        'Capture a single UI element from a live Chrome page (no action performed) and return its canonical UIOBJECT/IMAGE/anchor payload pieces.',
      inputSchema: z.object({
        url: z.string().min(1),
        target: z.string().min(1),
        hints: z
          .object({ role: z.string().optional(), exactText: z.string().optional() })
          .optional(),
        captureImage: z.boolean().optional(),
        includeAnchor: z.boolean().optional(),
        browserUrl: z.string().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.captureUiTarget(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_insert_recorder_step',
    {
      description:
        'Insert captured recorder node(s) into an existing bot (append or after a node uid), ensure the Recorder package dependency, and save via the normalized bundle flow.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        nodes: z.array(z.record(z.string(), z.unknown())).min(1),
        afterUid: z.string().optional(),
        recorderPackage: z
          .object({ name: z.string().min(1), version: z.string().min(1) })
          .optional(),
        hasErrors: z.boolean().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.insertRecorderSteps(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_patch_step_target',
    {
      description:
        'Replace one attribute value (e.g. a UIOBJECT target) on an existing bot node with a captured payload and save via the normalized bundle flow.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        nodeUid: z.string().min(1),
        attributeName: z.string().min(1),
        value: z.record(z.string(), z.unknown()),
        hasErrors: z.boolean().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.patchStepTarget(input), null, 2),
        },
      ],
    }),
  );
}
```

- [ ] **Step 3: Export from `src/tools/index.ts`**

Add (matching the existing export style):

```ts
export { registerCaptureTools } from './capture.js';
```

- [ ] **Step 4: Wire dependencies in `src/server.ts`**

Add imports near the other workflow imports:

```ts
import { insertRecorderSteps, patchStepTarget } from './workflows/bot-injection.js';
import { recordWebActions } from './workflows/ui-recording.js';
import { matchElement } from './capture/element-matcher.js';
import { buildCapturedTargetPayload } from './capture/target-payload.js';
import { registerCaptureTools } from './tools/index.js';
```

(`registerCaptureTools` joins the existing `registerOperationsTools, ...` import.)

Inside `buildDependenciesFromConfig`, after `workflowApi`, add a `captureApi` block.
The Chrome session is imported dynamically so the server starts fine on machines
without Chrome until a capture tool is actually called:

```ts
captureApi: {
  recordWebActions: async (input: {
    startUrl: string;
    steps: Array<Record<string, unknown>>;
    captureImages?: boolean;
    includeAnchors?: boolean;
    recorderCommand?: Record<string, string | undefined>;
    browserUrl?: string;
  }) => {
    const { connectChromeSession } = await import('./capture/chrome-session.js');
    const browser = await connectChromeSession({ browserUrl: input.browserUrl });
    try {
      return await recordWebActions(browser, {
        startUrl: input.startUrl,
        steps: input.steps as never,
        captureImages: input.captureImages,
        includeAnchors: input.includeAnchors,
        recorderCommand: input.recorderCommand as never,
      });
    } finally {
      await browser.close();
    }
  },
  captureUiTarget: async (input: {
    url: string;
    target: string;
    hints?: { role?: string; exactText?: string };
    captureImage?: boolean;
    includeAnchor?: boolean;
    browserUrl?: string;
  }) => {
    const { connectChromeSession } = await import('./capture/chrome-session.js');
    const browser = await connectChromeSession({ browserUrl: input.browserUrl });
    try {
      await browser.gotoUrl(input.url);
      const elements = await browser.snapshotElements();
      const match = matchElement(input.target, elements, input.hints);
      if (match.status !== 'matched') {
        return { status: match.status, candidates: match.candidates };
      }
      const screenshotBase64 = input.captureImage
        ? ((await browser.screenshotElement(match.element.elementId)) ?? undefined)
        : undefined;
      const payload = buildCapturedTargetPayload(match.element, {
        screenshotBase64,
        includeAnchor: input.includeAnchor,
      });
      return { status: 'matched', payload };
    } finally {
      await browser.close();
    }
  },
  insertRecorderSteps: (input: {
    fileId: string;
    nodes: Array<Record<string, unknown>>;
    afterUid?: string;
    recorderPackage?: { name: string; version: string };
    hasErrors?: boolean;
  }) =>
    insertRecorderSteps(
      {
        getFileContent: (fileId: string) => getFileContent(client, fileId),
        getFileDependencies: (fileId: string) => getFileDependencies(client, fileId),
        updateFileContent: (
          fileId: string,
          content: Record<string, unknown>,
          hasErrors?: boolean,
        ) => updateFileContent(client, fileId, content, hasErrors),
        updateFileDependencies: (fileId: string, childFileIds: string[]) =>
          updateFileDependencies(client, fileId, childFileIds),
      },
      input,
    ),
  patchStepTarget: (input: {
    fileId: string;
    nodeUid: string;
    attributeName: string;
    value: Record<string, unknown>;
    hasErrors?: boolean;
  }) =>
    patchStepTarget(
      {
        getFileContent: (fileId: string) => getFileContent(client, fileId),
        getFileDependencies: (fileId: string) => getFileDependencies(client, fileId),
        updateFileContent: (
          fileId: string,
          content: Record<string, unknown>,
          hasErrors?: boolean,
        ) => updateFileContent(client, fileId, content, hasErrors),
        updateFileDependencies: (fileId: string, childFileIds: string[]) =>
          updateFileDependencies(client, fileId, childFileIds),
      },
      input,
    ),
},
```

In `createServer`, alongside the existing `registerWorkflowTools(server, deps)` call, add:

```ts
registerCaptureTools(server, deps);
```

- [ ] **Step 5: Run the server test and the full suite**

Run: `npx vitest run tests/server.test.ts`
Expected: PASS with the four new tool names present.

Run: `npm run check && npm test`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/tools/capture.ts src/tools/index.ts src/server.ts tests/server.test.ts
git commit -m "feat: expose live UI capture and recorder injection MCP tools"
```

---

### Task 8: Documentation + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new tools in README.md**

Add a section near the existing tool documentation:

```markdown
### Live UI capture tools

These tools build recorder steps from real Chrome state instead of guessed payloads.
They connect to your Chrome over the DevTools Protocol. Start Chrome with:

    chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\a360-capture-profile

or set `A360_MCP_CHROME_ENDPOINT` to an existing DevTools URL.

| Tool | Purpose |
| --- | --- |
| `a360_record_web_actions` | Execute structured steps (navigate/click/type/select) live in Chrome; capture each target into canonical `UIOBJECT`/`IMAGE` payloads plus ready recorder nodes. Halts with ranked candidates on ambiguity. |
| `a360_capture_ui_target` | Capture one element (no action) into canonical payload pieces. |
| `a360_insert_recorder_step` | Insert captured recorder node(s) into an existing bot and save via the normalized bundle flow. |
| `a360_patch_step_target` | Replace a node attribute's target payload with a captured one and save. |

The MCP client decomposes a natural-language prompt into structured steps; the
server matches each target description deterministically against the page's
elements — no AI guessing inside the server. Recorder command identity
(`packageName`/`commandName`/attribute names) defaults to `Recorder`/`Capture`
and is overridable per call; verify against `a360_get_package_command_schema`.
```

- [ ] **Step 2: Full verification**

Run: `npm run check && npm test`
Expected: typecheck passes; all test files pass (previous 52 tests + ~27 new).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document live UI capture tools"
```
