// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { measureCellVisibility } from './PlotArea';

// PlotArea's renderers pull in Observable Plot (ESM); not needed here.
jest.mock('../ObservablePlot', () => ({ __esModule: true, default: () => null }));
jest.mock('./renderers/PieSvgRenderer', () => ({ __esModule: true, default: () => null }));

function rect(top: number, left: number, height: number, width: number): DOMRect {
  return { top, left, height, width, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** clip (overflow hidden) > translated content > cell */
function setup(cellTop: number, cellLeft = 0) {
  const clip = document.createElement('div');
  clip.style.overflow = 'hidden';
  const content = document.createElement('div');
  const cell = document.createElement('div');
  clip.appendChild(content);
  content.appendChild(cell);
  document.body.appendChild(clip);
  clip.getBoundingClientRect = () => rect(100, 50, 400, 600);
  content.getBoundingClientRect = () => rect(0, 0, 2000, 600);
  cell.getBoundingClientRect = () => rect(cellTop, cellLeft, 200, 300);
  return cell;
}

describe('measureCellVisibility', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  test('cell fully visible: nothing hidden', () => {
    expect(measureCellVisibility(setup(150), true)).toEqual({ hiddenPx: 0, sizePx: 200 });
  });

  test('cell partly scrolled above the clip: hidden part along y', () => {
    expect(measureCellVisibility(setup(40), true)).toEqual({ hiddenPx: 60, sizePx: 200 });
  });

  test('horizontal measurement uses the left edge', () => {
    expect(measureCellVisibility(setup(150, 10), false)).toEqual({ hiddenPx: 40, sizePx: 300 });
  });
});
