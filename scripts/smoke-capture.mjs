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
