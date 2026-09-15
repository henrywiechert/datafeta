// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * A monotone ratchet on hardcoded colors in CSS.
 *
 * The ESLint `no-restricted-syntax` rules in package.json police `.ts`/`.tsx`
 * per-file, but nothing lints CSS: stylelint is not installed, and adding it
 * would mean ~40 transitive packages plus a second config and ignore list to
 * cover 34 files. This test does the same job with no new tooling and no git
 * plumbing — it runs inside the existing `npm test` CI step.
 *
 * The contract is deliberately two-sided:
 *   - a file may never exceed its budget (no new literals)
 *   - a file may never sit *under* its budget (the numbers stay honest)
 * So a migration slice that removes literals must also tighten the budget, and
 * `cssColorBudget.json` doubles as the progress bar for the CSS half of the
 * sweep — the counterpart to the shrinking override list in package.json.
 *
 * Run `UPDATE_COLOR_BUDGET=1 npx react-scripts test --watchAll=false
 * --testPathPattern cssColorBudget` to rewrite the budget after a slice.
 *
 * A line carrying `color-literal-ok: <reason>` is not counted — the escape
 * hatch for a color that genuinely cannot be a token.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');
const BUDGET_PATH = path.join(__dirname, 'cssColorBudget.json');

/** Hex and functional notation are counted anywhere on the line: they cannot
 *  plausibly appear in a selector (the only id selector in the app is `#root`,
 *  and `root` is not hex), so continuation lines of multi-line declarations
 *  like `box-shadow` are covered too. */
const ANYWHERE = [/#[0-9a-fA-F]{3,8}\b/g, /\b(?:rgba?|hsla?)\s*\(/g];

/** Named colors are counted only in the value half of a declaration, so class
 *  names like `.green-badge` don't register as colors. */
const VALUE_ONLY = [
  /\b(?:white|black|gray|grey|silver|red|green|blue|yellow|orange|purple|pink|brown|cyan|magenta|navy|teal|olive|maroon|lime|aqua|fuchsia|steelblue)\b/g,
];

const countMatches = (text: string, patterns: RegExp[]): number =>
  patterns.reduce((sum, re) => sum + (text.match(re)?.length ?? 0), 0);

export const countColorLiterals = (source: string): number =>
  source.split('\n').reduce((total, line) => {
    if (line.includes('color-literal-ok')) return total;
    const colonIndex = line.indexOf(':');
    const value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    return total + countMatches(line, ANYWHERE) + countMatches(value, VALUE_ONLY);
  }, 0);

const collectCssFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCssFiles(full, found);
    else if (entry.name.endsWith('.css')) found.push(full);
  }
  return found;
};

const actualCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const file of collectCssFiles(SRC_ROOT).sort()) {
    const count = countColorLiterals(fs.readFileSync(file, 'utf8'));
    if (count > 0) {
      counts[`src/${path.relative(SRC_ROOT, file).split(path.sep).join('/')}`] = count;
    }
  }
  return counts;
};

describe('CSS color literal budget', () => {
  const actual = actualCounts();
  const budget: Record<string, number> = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));

  if (process.env.UPDATE_COLOR_BUDGET) {
    fs.writeFileSync(BUDGET_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    it('rewrote the budget (UPDATE_COLOR_BUDGET was set)', () => {
      expect(Object.keys(actual).length).toBeGreaterThanOrEqual(0);
    });
    return;
  }

  it('has no CSS file over its budget, and none outside the budget', () => {
    const overspent = Object.entries(actual)
      .filter(([file, count]) => count > (budget[file] ?? 0))
      .map(([file, count]) => `  ${file}: ${count} > ${budget[file] ?? 0} allowed`);

    expect(overspent.join('\n')).toBe('');
  });

  it('has no stale budget entries (the ratchet only tightens)', () => {
    const slack = Object.entries(budget)
      .filter(([file, allowed]) => (actual[file] ?? 0) < allowed)
      .map(([file, allowed]) => `  ${file}: ${actual[file] ?? 0} actual < ${allowed} budgeted`);

    expect(slack.join('\n')).toBe('');
  });
});
