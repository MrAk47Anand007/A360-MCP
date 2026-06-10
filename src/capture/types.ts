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
