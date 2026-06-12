import puppeteer, { type Browser, type Page, type ElementHandle } from 'puppeteer-core';
import type { CaptureBrowser, ElementFacts } from './types.js';
import { buildSurroundingContext } from './surrounding-context.js';

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

  async function settlePage() {
    await page
      .waitForFunction(() => document.readyState === 'interactive' || document.readyState === 'complete', {
        timeout: 5_000,
      })
      .catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 250, timeout: 5_000 }).catch(() => {});
  }

  async function snapshotElements(): Promise<ElementFacts[]> {
    for (const handle of handles.values()) {
      await handle.dispose().catch(() => {});
    }
    handles = new Map();

    const elementHandles = await page.$$(INTERACTIVE_SELECTOR);
    const facts: ElementFacts[] = [];

    for (const [index, handle] of elementHandles.entries()) {
      const raw = await handle.evaluate((element): RawElementFacts => {
        const htmlElement = element as HTMLInputElement;
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
        const parentLabel =
          !labelText && htmlElement.closest
            ? htmlElement.closest('label')?.innerText.trim() ?? ''
            : '';
        const name =
          attributes['aria-label'] ?? labelText ?? parentLabel ?? '';

        let helpText = '';
        const describedBy = htmlElement.getAttribute('aria-describedby');
        if (describedBy) {
          const describedNode = htmlElement.ownerDocument.getElementById(describedBy);
          const describedText = describedNode?.textContent?.trim();
          if (describedText) {
            helpText = describedText.slice(0, 200);
          }
        }
        if (!helpText) {
          helpText = (
            htmlElement.getAttribute('title') ??
            htmlElement.getAttribute('placeholder') ??
            ''
          ).trim().slice(0, 200);
        }

        let stableParentSelector = '';
        let parentCursor = htmlElement.parentElement;
        while (parentCursor && parentCursor !== document.body) {
          const testId =
            parentCursor.getAttribute('data-testid') ??
            parentCursor.getAttribute('data-test-id') ??
            parentCursor.getAttribute('data-qa');
          if (testId) {
            stableParentSelector = `[data-testid="${testId}"]`;
            break;
          }
          if (parentCursor.id && !/\d{4,}/.test(parentCursor.id)) {
            stableParentSelector = `#${parentCursor.id}`;
            break;
          }
          const parentAriaLabel = parentCursor.getAttribute('aria-label');
          const parentRole = parentCursor.getAttribute('role');
          if (parentRole && parentAriaLabel) {
            stableParentSelector = `[role="${parentRole}"][aria-label="${parentAriaLabel}"]`;
            break;
          }
          parentCursor = parentCursor.parentElement;
        }

        const recommendedSelectors: Array<{ type: string; selector: string; reason: string }> = [];
        if (attributes.id && !/\d{4,}/.test(attributes.id)) {
          recommendedSelectors.push({
            type: 'id',
            selector: `//${tag}[@id='${attributes.id}']`,
            reason: 'Stable element id',
          });
        }
        if (attributes.name && !/\d{4,}/.test(attributes.name)) {
          recommendedSelectors.push({
            type: 'name',
            selector: `//${tag}[@name='${attributes.name}']`,
            reason: 'Stable element name',
          });
        }
        if ((labelText || parentLabel) && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
          const label = (labelText || parentLabel).replace(/"/g, '\\"');
          recommendedSelectors.push({
            type: 'label',
            selector: `//label[contains(normalize-space(.), "${label}")]/following::${tag}[1]`,
            reason: 'First matching control after associated label',
          });
        }
        if (stableParentSelector) {
          recommendedSelectors.push({
            type: 'stable-parent',
            selector: stableParentSelector,
            reason: 'Nearest stable ancestor',
          });
        }

        const pathParts: string[] = [];
        let current: Element | null = htmlElement;
        while (current && current !== document.body && pathParts.length < 12) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part += `#${current.id}`;
            pathParts.unshift(part);
            break;
          }
          const parent: Element | null = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (sibling) => (sibling as Element).tagName === current!.tagName,
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
          pageUrl: window.location.href,
          pageTitle: document.title,
          associatedLabel: labelText || parentLabel,
          helpText,
          stableParentSelector,
          recommendedSelectors: recommendedSelectors.slice(0, 4),
          visible,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });

      const elementId = `el-${index + 1}`;
      handles.set(elementId, handle);
      facts.push({ elementId, ...raw });
    }

    return facts.map((fact) => ({
      ...fact,
      surroundingContext: buildSurroundingContext(fact, facts),
    }));
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
      await settlePage();
    },
    currentUrl: async () => page.url(),
    snapshotElements,
    click: async (elementId) => {
      await requireHandle(elementId).click();
      await settlePage();
    },
    type: async (elementId, text) => {
      const handle = requireHandle(elementId);
      await handle.click({ count: 3 });
      await handle.type(text);
      await settlePage();
    },
    select: async (elementId, value) => {
      const handle = requireHandle(elementId);
      await handle.select(value);
      await settlePage();
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
