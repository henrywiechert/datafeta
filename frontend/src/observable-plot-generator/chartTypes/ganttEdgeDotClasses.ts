// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Class names tagging the Gantt bar's invisible start/end snap-target dots.
 * Split out from ganttChart.ts so consumers that only need the class names
 * (e.g. the measurement snap logic) don't pull in `@observablehq/plot`.
 */
export const GANTT_EDGE_DOT_START_CLASS = 'gantt-edge-dot--start';
export const GANTT_EDGE_DOT_END_CLASS = 'gantt-edge-dot--end';
