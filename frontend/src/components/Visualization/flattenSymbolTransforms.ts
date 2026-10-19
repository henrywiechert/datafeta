// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Bake the per-dot `transform="translate(x,y)"` of Plot's symbol dots into
 * their path data.
 *
 * Plot draws every dot that isn't a plain circle (shape encodings, manual
 * shapes, heatmap squares) as a `<path>` centred on 0,0 and moved by its own
 * transform attribute. Chrome gives each transformed SVG element a transform
 * node of its own and so a paint chunk of its own, and any frame that
 * re-layerizes the page walks all of them: panning a shaped scatter spent
 * 200–340ms per frame in Layerize, the same dots without transforms ~0.
 * The same shape drawn at absolute coordinates needs no transform.
 */

const DOT_PATH_SELECTOR = 'g[aria-label="dot"] > path[transform]';

const NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const TRANSLATE_RE = new RegExp(`^translate\\(\\s*(${NUMBER})\\s*[,\\s]\\s*(${NUMBER})\\s*\\)$`);
const COMMAND_RE = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;

/**
 * Which arguments of an absolute command are x (0) / y (1) coordinates, per
 * repeat group; null leaves the argument as is (arc radii and flags).
 */
const ABSOLUTE_AXES: Record<string, Array<0 | 1 | null>> = {
  M: [0, 1],
  L: [0, 1],
  T: [0, 1],
  H: [0],
  V: [1],
  C: [0, 1, 0, 1, 0, 1],
  S: [0, 1, 0, 1],
  Q: [0, 1, 0, 1],
  A: [null, null, null, null, null, 0, 1],
};

/** Path data with the coordinate slots left open: literal, slot, literal, slot, …, literal. */
interface CompiledPath {
  literals: string[];
  values: number[];
  axes: Array<0 | 1>;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Null for path data this can't offset safely (e.g. a leading relative moveto). */
export function compilePathData(d: string): CompiledPath | null {
  const literals: string[] = [];
  const values: number[] = [];
  const axes: Array<0 | 1> = [];
  let pending = '';
  let consumed = 0;
  let first = true;
  for (const [match, command, rawArgs] of Array.from(d.matchAll(COMMAND_RE))) {
    consumed += match.length;
    // The first moveto is absolute even when lowercase, and its implicit
    // lineto repeats are relative: not worth supporting.
    if (first && command !== 'M') return null;
    first = false;
    const args = rawArgs.trim() === '' ? [] : rawArgs.trim().split(/\s*,\s*|\s+/);
    pending += command;
    const slots = ABSOLUTE_AXES[command];
    if (!slots) {
      // Relative commands and closepath move with the absolute points before them.
      pending += args.join(',');
      continue;
    }
    if (args.length % slots.length !== 0) return null;
    for (let i = 0; i < args.length; i++) {
      if (i > 0) pending += ',';
      const axis = slots[i % slots.length];
      if (axis === null) {
        pending += args[i];
        continue;
      }
      const value = Number(args[i]);
      if (!Number.isFinite(value)) return null;
      literals.push(pending);
      pending = '';
      values.push(value);
      axes.push(axis);
    }
  }
  if (consumed !== d.length) return null;
  literals.push(pending);
  return { literals, values, axes };
}

export function offsetPathData(path: CompiledPath, dx: number, dy: number): string {
  let out = path.literals[0];
  for (let i = 0; i < path.values.length; i++) {
    out += round(path.values[i] + (path.axes[i] === 0 ? dx : dy)) + path.literals[i + 1];
  }
  return out;
}

/** Run on the plot before it is attached: attribute writes on a detached tree are cheap. */
export function flattenSymbolTransforms(plot: Element): void {
  // Dots share a handful of symbol/size combinations, so compile each once.
  const compiled = new Map<string, CompiledPath | null>();
  const paths = plot.querySelectorAll(DOT_PATH_SELECTOR);
  for (let i = 0; i < paths.length; i++) {
    const el = paths[i];
    const translate = TRANSLATE_RE.exec(el.getAttribute('transform') ?? '');
    const d = el.getAttribute('d');
    if (!translate || !d) continue;
    const dx = Number(translate[1]);
    const dy = Number(translate[2]);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    let path = compiled.get(d);
    if (path === undefined) {
      path = compilePathData(d);
      compiled.set(d, path);
    }
    if (!path) continue;
    el.setAttribute('d', offsetPathData(path, dx, dy));
    el.removeAttribute('transform');
  }
}
