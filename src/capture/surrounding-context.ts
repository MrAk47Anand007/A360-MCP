import type { ElementFacts } from './types.js';

type ComparableNeighbor = {
  tag: string;
  role: string;
  name: string;
  text: string;
  type: string;
};

export type CapturedSurroundingContext = {
  page: {
    url: string;
    title: string;
    host: string;
    path: string;
  };
  target: ComparableNeighbor & {
    id: string;
    elementId: string;
    domPath: string;
    associatedLabel: string;
    helpText: string;
    stableParentSelector: string;
    recommendedSelectors: Array<{ type: string; selector: string; reason: string }>;
  };
  previous: ComparableNeighbor | null;
  next: ComparableNeighbor | null;
  position: {
    nthOfType: number;
    totalOfType: number;
  };
};

export type SurroundingContextValidation = {
  isMatch: boolean;
  confidence: number;
  reasons: string[];
};

export type RankedContextCandidate = {
  element: ElementFacts;
  validation: SurroundingContextValidation;
};

function asNeighbor(facts?: ElementFacts | null): ComparableNeighbor | null {
  if (!facts) {
    return null;
  }

  return {
    tag: facts.tag,
    role: facts.role,
    name: facts.name,
    text: facts.text,
    type: facts.attributes.type ?? '',
  };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getPageParts(pageUrl?: string) {
  if (!pageUrl) {
    return { url: '', title: '', host: '', path: '' };
  }

  try {
    const parsed = new URL(pageUrl);
    return {
      url: pageUrl,
      title: '',
      host: parsed.host,
      path: parsed.pathname,
    };
  } catch {
    return { url: pageUrl, title: '', host: '', path: '' };
  }
}

export function buildSurroundingContext(
  target: ElementFacts,
  orderedElements: ElementFacts[],
): CapturedSurroundingContext {
  const index = orderedElements.findIndex((item) => item.elementId === target.elementId);
  const page = getPageParts(target.pageUrl);
  const sameType = orderedElements.filter(
    (item) => item.tag === target.tag && (item.attributes.type ?? '') === (target.attributes.type ?? ''),
  );
  const nthOfType = sameType.findIndex((item) => item.elementId === target.elementId) + 1;

  return {
    page: {
      ...page,
      title: target.pageTitle ?? '',
    },
    target: {
      ...(asNeighbor(target) as ComparableNeighbor),
      id: target.attributes.id ?? '',
      elementId: target.elementId,
      domPath: target.domPath,
      associatedLabel: target.associatedLabel ?? '',
      helpText: target.helpText ?? '',
      stableParentSelector: target.stableParentSelector ?? '',
      recommendedSelectors: target.recommendedSelectors ?? [],
    },
    previous: asNeighbor(index > 0 ? orderedElements[index - 1] : null),
    next: asNeighbor(index >= 0 && index < orderedElements.length - 1 ? orderedElements[index + 1] : null),
    position: {
      nthOfType: Math.max(nthOfType, 0),
      totalOfType: sameType.length,
    },
  };
}

function compareNeighbor(
  expected: ComparableNeighbor | null,
  candidate: ComparableNeighbor | null,
  label: string,
  reasons: string[],
) {
  if (!expected || !candidate) {
    return 0.5;
  }

  let score = 0;
  if (expected.tag === candidate.tag) {
    score += 0.35;
  } else {
    reasons.push(`${label} tag changed (${expected.tag} -> ${candidate.tag})`);
  }
  if (expected.role === candidate.role) {
    score += 0.25;
  }
  const expectedText = normalizeText(expected.text || expected.name);
  const candidateText = normalizeText(candidate.text || candidate.name);
  if (expectedText && candidateText && expectedText === candidateText) {
    score += 0.4;
  }
  return score;
}

export function validateSurroundingContext(
  captured: CapturedSurroundingContext,
  candidate: CapturedSurroundingContext,
): SurroundingContextValidation {
  const reasons: string[] = [];
  let score = 0;

  if (captured.target.tag !== candidate.target.tag) {
    reasons.push(`Target tag mismatch (${captured.target.tag} -> ${candidate.target.tag})`);
    return { isMatch: false, confidence: 0, reasons };
  }

  if (captured.target.role !== candidate.target.role) {
    reasons.push(`Target role mismatch (${captured.target.role} -> ${candidate.target.role})`);
    return { isMatch: false, confidence: 0, reasons };
  }

  score += 0.25;

  if (captured.page.host && captured.page.host === candidate.page.host) {
    score += 0.15;
  } else if (captured.page.host || candidate.page.host) {
    reasons.push('Page host changed');
  }

  const capturedId = normalizeText(captured.target.id);
  const candidateId = normalizeText(candidate.target.id);
  if (capturedId && candidateId && capturedId === candidateId) {
    score += 0.25;
  } else {
    const capturedIdentity = normalizeText(captured.target.name || captured.target.text);
    const candidateIdentity = normalizeText(candidate.target.name || candidate.target.text);
    if (capturedIdentity && candidateIdentity && capturedIdentity === candidateIdentity) {
      score += 0.2;
    } else {
      reasons.push('Target identity text changed');
    }
  }

  const capturedLabel = normalizeText(captured.target.associatedLabel);
  const candidateLabel = normalizeText(candidate.target.associatedLabel);
  if (capturedLabel && candidateLabel && capturedLabel === candidateLabel) {
    score += 0.1;
  } else if (capturedLabel || candidateLabel) {
    reasons.push('Associated label changed');
  }

  const capturedParent = normalizeText(captured.target.stableParentSelector);
  const candidateParent = normalizeText(candidate.target.stableParentSelector);
  if (capturedParent && candidateParent && capturedParent === candidateParent) {
    score += 0.05;
  }

  score += compareNeighbor(captured.previous, candidate.previous, 'Previous neighbor', reasons) * 0.15;
  score += compareNeighbor(captured.next, candidate.next, 'Next neighbor', reasons) * 0.15;

  if (
    captured.position.nthOfType > 0 &&
    candidate.position.nthOfType > 0 &&
    captured.position.nthOfType === candidate.position.nthOfType
  ) {
    score += 0.05;
  }

  const confidence = Math.min(1, Number(score.toFixed(4)));
  return {
    isMatch: confidence >= 0.65,
    confidence,
    reasons,
  };
}

export function rankElementsBySurroundingContext(
  captured: CapturedSurroundingContext,
  elements: ElementFacts[],
): RankedContextCandidate[] {
  return elements
    .map((element) => {
      const candidateContext = element.surroundingContext as CapturedSurroundingContext | undefined;
      const validation = candidateContext
        ? validateSurroundingContext(captured, candidateContext)
        : {
            isMatch: false,
            confidence: 0,
            reasons: ['Candidate target did not produce surrounding context.'],
          };
      return { element, validation };
    })
    .sort((left, right) => right.validation.confidence - left.validation.confidence);
}
