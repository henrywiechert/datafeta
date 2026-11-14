// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Enlarge dots and line strokes of a plot drawn much larger than the size its
 * marks were designed for (Zoom facet: a small grid cell shown in a dialog).
 *
 * Mark sizes are fixed pixels in the generator, so without this a zoomed facet
 * shows the same tiny dots and hairlines on a canvas many times larger. Works
 * on Plot's SVG output so every chart type and overlay benefits; must run on
 * the detached plot *before* `flattenSymbolTransforms`, while symbol paths are
 * still centred on 0,0.
 */
import { MARK_FIXED_SIZE_CLASS } from '../../observable-plot-generator/overlays/types';

export interface PlotSize {
  width: number;
  height: number;
}

export interface MarkScaleFactors {
  /** Multiplier for stroke widths (lines, rules, ticks, symbol outlines). */
  line: number;
  /** Multiplier for dot radii / symbol sizes. */
  dot: number;
}

// Marks grow sub-linearly with the plot: thick lines lose detail quickly,
// dots tolerate a bit more.
const LINE_EXPONENT = 0.5;
const DOT_EXPONENT = 0.6;
const MAX_LINE_SCALE = 2.5;
const MAX_DOT_SCALE = 3;
/** Max share of the frame the enlarged dots may cover (overplotting guard). */
const MAX_DOT_COVERAGE = 0.2;

const DOT_GROUP_SELECTOR = 'g[aria-label="dot"]';
const STROKE_GROUP_LABELS = ['line', 'area', 'rule', 'tick', 'link', 'linear-regression', 'density'];
/** Marks drawn with Plot's implicit SVG stroke-width of 1 (no attribute). */
const IMPLICIT_STROKE_LABELS = new Set(['line', 'rule', 'tick', 'link']);
const STROKE_GROUP_SELECTOR = STROKE_GROUP_LABELS.map((label) => `g[aria-label="${label}"]`).join(',');

const COMMAND_RE = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
const NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

const round = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Arc arguments 2–4 (rotation, large-arc and sweep flags) are not lengths. */
const isArcNonLength = (command: string, index: number) =>
  (command === 'A' || command === 'a') && index % 7 >= 2 && index % 7 <= 4;

/**
 * Uniformly scale path data about the origin. Every coordinate, relative delta
 * and arc radius scales by `k`; arc rotation and flags are kept. Null when the
 * path data can't be parsed.
 */
export function scalePathData(d: string, k: number): string | null {
  let out = '';
  let consumed = 0;
  for (const [match, command, rawArgs] of Array.from(d.matchAll(COMMAND_RE))) {
    consumed += match.length;
    const args = rawArgs.match(NUMBER_RE) ?? [];
    const scaled: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (isArcNonLength(command, i)) {
        scaled.push(args[i]);
        continue;
      }
      const value = Number(args[i]);
      if (!Number.isFinite(value)) return null;
      scaled.push(String(round(value * k)));
    }
    out += command + scaled.join(',');
  }
  return consumed === d.length && out !== '' ? out : null;
}

/** Approximate radius of a 0,0-centred symbol path: its largest coordinate. */
export function symbolPathRadius(d: string): number {
  let radius = 0;
  for (const [, command, rawArgs] of Array.from(d.matchAll(COMMAND_RE))) {
    const args = rawArgs.match(NUMBER_RE) ?? [];
    for (let i = 0; i < args.length; i++) {
      if (isArcNonLength(command, i)) continue;
      const value = Math.abs(Number(args[i]));
      if (Number.isFinite(value) && value > radius) radius = value;
    }
  }
  return radius;
}

/**
 * Scale factors for marks designed at `reference` size and drawn at `target`.
 * `dotAreaSum` is Σr² over the visible dots and caps the dot factor so the
 * enlarged dots cover at most MAX_DOT_COVERAGE of `frameArea`. Never shrinks.
 */
export function computeMarkScale(params: {
  reference: PlotSize;
  target: PlotSize;
  frameArea: number;
  dotAreaSum: number;
}): MarkScaleFactors {
  const { reference, target, frameArea, dotAreaSum } = params;
  const referenceArea = reference.width * reference.height;
  const targetArea = target.width * target.height;
  if (!(referenceArea > 0) || !(targetArea > 0)) return { line: 1, dot: 1 };

  const sizeRatio = Math.sqrt(targetArea / referenceArea);
  if (sizeRatio <= 1) return { line: 1, dot: 1 };

  const line = clamp(sizeRatio ** LINE_EXPONENT, 1, MAX_LINE_SCALE);
  let dot = Math.min(sizeRatio ** DOT_EXPONENT, MAX_DOT_SCALE);
  if (dotAreaSum > 0 && frameArea > 0) {
    // π·Σ(k·r)² ≤ coverage·area  ⇒  k ≤ √(coverage·area / (π·Σr²))
    dot = Math.min(dot, Math.sqrt((MAX_DOT_COVERAGE * frameArea) / (Math.PI * dotAreaSum)));
  }
  return { line, dot: Math.max(1, dot) };
}

const isInvisiblePaint = (value: string | null) => value === 'transparent' || value === 'none';

/** Attribute as inherited by `el` from itself or its ancestors up to `root`. */
function inheritedAttribute(el: Element, root: Element, name: string): string | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const value = node.getAttribute(name);
    if (value !== null) return value;
    if (node === root) break;
  }
  return null;
}

/**
 * Hover/hit-target dots (transparent fill and stroke) are interaction aids,
 * not visible marks: enlarging them would only blur tooltip targeting.
 */
function isHitTargetGroup(g: Element): boolean {
  const first = g.querySelector('circle, path');
  if (!first) return false;
  const stroke = inheritedAttribute(first, g, 'stroke');
  return isInvisiblePaint(inheritedAttribute(first, g, 'fill')) && (stroke === null || isInvisiblePaint(stroke));
}

// With clipping, Plot puts the mark's className on an inner <g>.
function scalableGroups(plot: Element, selector: string): Element[] {
  return Array.from(plot.querySelectorAll(selector)).filter(
    (g) => !g.classList.contains(MARK_FIXED_SIZE_CLASS) && !g.querySelector(`.${MARK_FIXED_SIZE_CLASS}`),
  );
}

function measureDotAreaSum(dotGroups: Element[], radiusCache: Map<string, number>): number {
  let sum = 0;
  for (const g of dotGroups) {
    const elements = g.querySelectorAll('circle, path');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      let r: number;
      if (el.tagName.toLowerCase() === 'circle') {
        r = Number(el.getAttribute('r'));
      } else {
        const d = el.getAttribute('d') ?? '';
        let cached = radiusCache.get(d);
        if (cached === undefined) {
          cached = symbolPathRadius(d);
          radiusCache.set(d, cached);
        }
        r = cached;
      }
      if (Number.isFinite(r) && r > 0) sum += r * r;
    }
  }
  return sum;
}

function scaleStrokeWidths(g: Element, k: number, implicitDefault?: number): void {
  let scaledAny = false;
  const scale = (el: Element) => {
    const width = Number(el.getAttribute('stroke-width'));
    if (el.hasAttribute('stroke-width') && Number.isFinite(width)) {
      el.setAttribute('stroke-width', String(round(width * k)));
      scaledAny = true;
    }
  };
  scale(g);
  const children = g.querySelectorAll('[stroke-width]');
  for (let i = 0; i < children.length; i++) scale(children[i]);
  if (!scaledAny && implicitDefault !== undefined) {
    g.setAttribute('stroke-width', String(round(implicitDefault * k)));
  }
}

function scaleDots(g: Element, factors: MarkScaleFactors, pathCache: Map<string, string | null>): void {
  if (factors.dot !== 1) {
    const elements = g.querySelectorAll('circle, path');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.tagName.toLowerCase() === 'circle') {
        const r = Number(el.getAttribute('r'));
        if (Number.isFinite(r)) el.setAttribute('r', String(round(r * factors.dot)));
        continue;
      }
      const d = el.getAttribute('d');
      if (!d) continue;
      let scaled = pathCache.get(d);
      if (scaled === undefined) {
        scaled = scalePathData(d, factors.dot);
        pathCache.set(d, scaled);
      }
      if (scaled) el.setAttribute('d', scaled);
    }
  }
  if (factors.line !== 1) scaleStrokeWidths(g, factors.line);
}

/** Plot frame area (inner plot, without margins) for the coverage guard. */
export function frameAreaFromOptions(options: Record<string, any>, size: PlotSize): number {
  const margin = (key: string) => {
    const value = options[key] ?? options.margin;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const width = Math.max(1, size.width - margin('marginLeft') - margin('marginRight'));
  const height = Math.max(1, size.height - margin('marginTop') - margin('marginBottom'));
  return width * height;
}

/**
 * Scale dots and line strokes of `plot` (drawn at `target`) whose marks were
 * sized for `reference`. Returns the applied factors.
 */
export function scaleMarkSizes(
  plot: Element,
  params: { reference: PlotSize; target: PlotSize; frameArea: number },
): MarkScaleFactors {
  const dotGroups = scalableGroups(plot, DOT_GROUP_SELECTOR).filter((g) => !isHitTargetGroup(g));
  const factors = computeMarkScale({
    ...params,
    dotAreaSum: measureDotAreaSum(dotGroups, new Map()),
  });
  if (factors.line === 1 && factors.dot === 1) return factors;

  const pathCache = new Map<string, string | null>();
  for (const g of dotGroups) scaleDots(g, factors, pathCache);

  if (factors.line !== 1) {
    for (const g of scalableGroups(plot, STROKE_GROUP_SELECTOR)) {
      const label = g.getAttribute('aria-label') ?? '';
      scaleStrokeWidths(g, factors.line, IMPLICIT_STROKE_LABELS.has(label) ? 1 : undefined);
    }
  }
  return factors;
}
