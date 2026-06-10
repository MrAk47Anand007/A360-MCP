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
