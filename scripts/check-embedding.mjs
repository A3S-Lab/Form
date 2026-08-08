import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import postcss from 'postcss';

const projectRoot = resolve(import.meta.dirname, '..');
const stylesheetPath = resolve(projectRoot, 'dist/styles.css');
const stylesheet = await readFile(stylesheetPath, 'utf8');
const uiPackage = JSON.parse(
  await readFile(resolve(projectRoot, 'node_modules/@a3s-lab/ui/package.json'), 'utf8'),
);
const uiFoundation = await readFile(
  resolve(projectRoot, 'node_modules/@a3s-lab/ui/dist/styles/a3s-foundation.css'),
  'utf8',
);
const { size } = await stat(stylesheetPath);
const gzipSize = gzipSync(stylesheet).byteLength;

const budgets = {
  raw: 120_000,
  gzip: 20_000,
};

const a3sUiVersion = '0.2.1';
const sharedTokens = [
  '--a3s-bg',
  '--a3s-panel',
  '--a3s-panel-soft',
  '--a3s-ink',
  '--a3s-muted',
  '--a3s-line',
  '--a3s-action',
  '--a3s-blue',
  '--a3s-green',
  '--a3s-red',
  '--a3s-radius',
];

if (uiPackage.version !== a3sUiVersion) {
  throw new Error(`Expected A3S UI ${a3sUiVersion}, found ${uiPackage.version}.`);
}

const missingTokens = sharedTokens.filter(
  (token) => !uiFoundation.includes(`${token}:`) || !stylesheet.includes(`var(${token},`),
);
if (missingTokens.length > 0) {
  throw new Error(
    `Embedding CSS drifted from A3S UI ${a3sUiVersion}: ${missingTokens.join(', ')}.`,
  );
}

function splitTopLevelSelectors(selector) {
  const selectors = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote;
  let escaped = false;

  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (character === ',' && parentheses === 0 && brackets === 0) {
      selectors.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selector.slice(start).trim());
  return selectors;
}

function isInsideKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

const violations = [];
const root = postcss.parse(stylesheet, { from: stylesheetPath });
root.walkRules((rule) => {
  if (isInsideKeyframes(rule)) return;
  for (const selector of splitTopLevelSelectors(rule.selector)) {
    if (!selector.startsWith('.a3s-form-')) violations.push(selector);
  }
});

if (/\/\*!\s*tailwindcss\b/i.test(stylesheet)) violations.push('Tailwind preflight banner');

if (violations.length > 0) {
  throw new Error(
    `Embedding CSS contains host-global selectors: ${[...new Set(violations)].slice(0, 8).join(', ')}. Keep every rule in the a3s-form-* namespace.`,
  );
}

if (size > budgets.raw || gzipSize > budgets.gzip) {
  throw new Error(
    `Embedding CSS exceeds its budget: ${size} bytes raw / ${gzipSize} bytes gzip; limits are ${budgets.raw} / ${budgets.gzip}.`,
  );
}

console.log(
  `Embedding CSS verified against A3S UI ${a3sUiVersion}: ${size} bytes raw, ${gzipSize} bytes gzip, no host-global reset.`,
);
