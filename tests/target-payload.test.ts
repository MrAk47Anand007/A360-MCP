import { describe, expect, it } from 'vitest';
import {
  buildCapturedTargetPayload,
  buildRecorderNode,
} from '../src/capture/target-payload.js';
import type { ElementFacts } from '../src/capture/types.js';
import { normalizeTaskBotContentForSave } from '../src/workflows/repository-save.js';

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
