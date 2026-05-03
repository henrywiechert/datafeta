import { TEXT_PX_PER_CHAR } from '../../components/Visualization/ChartGrid/utils/layoutUtils';

const MAX_CATEGORY_TICK_CHARS = {
  x: 18,
  y: 32,
} as const;

function normalizeCategoryTickValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncateCategoryTick(label: string, maxChars: number): string {
  if (label.length <= maxChars) {
    return label;
  }

  if (maxChars <= 3) {
    return '.'.repeat(Math.max(1, maxChars));
  }

  return `${label.slice(0, maxChars - 3).trimEnd()}...`;
}

export function buildCategoryTickFormatter(
  axis: 'x' | 'y', 
  maxChars?: number, 
  availablePx?: number | null
) {
  let finalMaxChars = maxChars ?? MAX_CATEGORY_TICK_CHARS[axis];
  if (availablePx) {
    // subtract some padding from availablePx before dividing
    finalMaxChars = Math.max(3, Math.floor((availablePx - 10) / TEXT_PX_PER_CHAR));
  }
  return (value: unknown): string => truncateCategoryTick(normalizeCategoryTickValue(value), finalMaxChars);
}
