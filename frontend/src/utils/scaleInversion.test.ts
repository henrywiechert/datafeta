import {
  invertQuantitative,
  invertBand,
  isBandScale,
  ScaleDescriptor,
} from './scaleInversion';

describe('invertQuantitative', () => {
  const linearScale: ScaleDescriptor = {
    type: 'linear',
    domain: [0, 100],
    range: [0, 500],
  };

  it('inverts the start of the range', () => {
    expect(invertQuantitative(0, linearScale)).toBe(0);
  });

  it('inverts the end of the range', () => {
    expect(invertQuantitative(500, linearScale)).toBe(100);
  });

  it('inverts the midpoint', () => {
    expect(invertQuantitative(250, linearScale)).toBe(50);
  });

  it('inverts with offset range', () => {
    const scale: ScaleDescriptor = {
      type: 'linear',
      domain: [10, 20],
      range: [100, 300],
    };
    expect(invertQuantitative(100, scale)).toBe(10);
    expect(invertQuantitative(200, scale)).toBe(15);
    expect(invertQuantitative(300, scale)).toBe(20);
  });

  it('inverts with reversed range', () => {
    const scale: ScaleDescriptor = {
      type: 'linear',
      domain: [0, 100],
      range: [500, 0],
    };
    expect(invertQuantitative(0, scale)).toBe(100);
    expect(invertQuantitative(500, scale)).toBe(0);
    expect(invertQuantitative(250, scale)).toBe(50);
  });

  it('handles sqrt scale', () => {
    const scale: ScaleDescriptor = {
      type: 'sqrt',
      domain: [0, 100],
      range: [0, 500],
    };
    // At midpoint of range (250px), sqrt interpolation:
    // t = 0.5, sqrt(0) + 0.5*(sqrt(100)-sqrt(0)) = 5, 5^2 = 25
    expect(invertQuantitative(250, scale)).toBe(25);
    expect(invertQuantitative(0, scale)).toBe(0);
    expect(invertQuantitative(500, scale)).toBe(100);
  });

  it('handles log scale', () => {
    const scale: ScaleDescriptor = {
      type: 'log',
      domain: [1, 1000],
      range: [0, 300],
    };
    // At 0px → 1, at 300px → 1000
    expect(invertQuantitative(0, scale)).toBeCloseTo(1);
    expect(invertQuantitative(300, scale)).toBeCloseTo(1000);
    // At 150px (midpoint): exp(ln(1) + 0.5*(ln(1000)-ln(1))) = exp(0.5*ln(1000)) = sqrt(1000)
    expect(invertQuantitative(150, scale)).toBeCloseTo(Math.sqrt(1000), 5);
  });

  it('returns domain start when range has zero width', () => {
    const scale: ScaleDescriptor = {
      type: 'linear',
      domain: [10, 20],
      range: [100, 100],
    };
    expect(invertQuantitative(100, scale)).toBe(10);
  });
});

describe('invertBand', () => {
  it('selects overlapping bands', () => {
    const scale: ScaleDescriptor = {
      type: 'band',
      domain: ['A', 'B', 'C', 'D', 'E'],
      range: [0, 500],
      step: 100,
      bandwidth: 80,
      paddingOuter: 0,
      align: 0.5,
    };

    // Bands: A [0,80], B [100,180], C [200,280], D [300,380], E [400,480]
    expect(invertBand(50, 250, scale)).toEqual(['A', 'B', 'C']);
    expect(invertBand(0, 80, scale)).toEqual(['A']);
    expect(invertBand(95, 105, scale)).toEqual(['B']);
    expect(invertBand(0, 500, scale)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('handles reversed start/end', () => {
    const scale: ScaleDescriptor = {
      type: 'band',
      domain: ['X', 'Y', 'Z'],
      range: [0, 300],
      step: 100,
      bandwidth: 80,
      paddingOuter: 0,
      align: 0.5,
    };
    expect(invertBand(250, 50, scale)).toEqual(['X', 'Y', 'Z']);
  });

  it('returns empty for selection between bands', () => {
    const scale: ScaleDescriptor = {
      type: 'band',
      domain: ['A', 'B'],
      range: [0, 200],
      step: 100,
      bandwidth: 80,
      paddingOuter: 0,
      align: 0.5,
    };
    // Gap between A [0,80] and B [100,180] is [80, 100]
    expect(invertBand(82, 98, scale)).toEqual([]);
  });

  it('estimates when bandwidth/step not provided', () => {
    const scale: ScaleDescriptor = {
      type: 'band',
      domain: ['P', 'Q', 'R'],
      range: [0, 300],
    };
    // Without step/bandwidth, uses estimated step=100, bandwidth=80
    const result = invertBand(0, 300, scale);
    expect(result).toEqual(['P', 'Q', 'R']);
  });

  it('returns empty for empty domain', () => {
    const scale: ScaleDescriptor = {
      type: 'band',
      domain: [],
      range: [0, 100],
    };
    expect(invertBand(0, 50, scale)).toEqual([]);
  });
});

describe('isBandScale', () => {
  it('returns true for band type', () => {
    expect(isBandScale({ type: 'band' })).toBe(true);
  });

  it('returns true for point type', () => {
    expect(isBandScale({ type: 'point' })).toBe(true);
  });

  it('returns true for ordinal type', () => {
    expect(isBandScale({ type: 'ordinal' })).toBe(true);
  });

  it('returns false for linear type', () => {
    expect(isBandScale({ type: 'linear' })).toBe(false);
  });

  it('returns false for undefined type', () => {
    expect(isBandScale({})).toBe(false);
  });
});
