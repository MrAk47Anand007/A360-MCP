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
