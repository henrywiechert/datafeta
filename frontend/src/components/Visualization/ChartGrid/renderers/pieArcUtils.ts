export interface PieArcInput {
  startAngle: number;
  endAngle: number;
  radius: number;
  cx: number;
  cy: number;
}

export interface PieArcSegment extends PieArcInput {
  path: string;
  largeArcFlag: 0 | 1;
}

const FULL_CIRCLE_EPSILON = 1e-6;

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function describePieArc(input: PieArcInput): string {
  const { startAngle, endAngle, radius, cx, cy } = input;
  const clampedRadius = Math.max(0, radius);
  const delta = Math.max(0, endAngle - startAngle);

  if (clampedRadius === 0 || delta <= 0) {
    return '';
  }

  if (Math.abs(delta - Math.PI * 2) < FULL_CIRCLE_EPSILON) {
    const midAngle = startAngle + Math.PI;
    const start = polarToCartesian(cx, cy, clampedRadius, startAngle);
    const mid = polarToCartesian(cx, cy, clampedRadius, midAngle);
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${clampedRadius} ${clampedRadius} 0 1 1 ${mid.x} ${mid.y}`,
      `A ${clampedRadius} ${clampedRadius} 0 1 1 ${start.x} ${start.y}`,
      'Z',
    ].join(' ');
  }

  const start = polarToCartesian(cx, cy, clampedRadius, startAngle);
  const end = polarToCartesian(cx, cy, clampedRadius, endAngle);
  const largeArcFlag = delta > Math.PI ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${clampedRadius} ${clampedRadius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export function buildPieArcSegments(args: {
  values: number[];
  radius: number;
  cx: number;
  cy: number;
  startAngle?: number;
}): PieArcSegment[] {
  const { values, radius, cx, cy, startAngle = -Math.PI / 2 } = args;
  const total = values.reduce((sum, value) => sum + (value > 0 ? value : 0), 0);
  if (total <= 0) return [];

  let cursor = startAngle;
  return values.map((value) => {
    const safeValue = value > 0 ? value : 0;
    const angle = (safeValue / total) * Math.PI * 2;
    const segmentInput = {
      startAngle: cursor,
      endAngle: cursor + angle,
      radius,
      cx,
      cy,
    };
    cursor += angle;
    return {
      ...segmentInput,
      path: describePieArc(segmentInput),
      largeArcFlag: angle > Math.PI ? 1 : 0,
    };
  });
}
