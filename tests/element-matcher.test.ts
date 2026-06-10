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
