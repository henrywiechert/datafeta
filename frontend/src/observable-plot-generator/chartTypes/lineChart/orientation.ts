// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

export const LINE_ORIENTATION = {
  horizontal: {
    independentAxis: 'x' as const,
    dependentAxis: 'y' as const,
    chartType: 'line' as const,
  },
  vertical: {
    independentAxis: 'y' as const,
    dependentAxis: 'x' as const,
    chartType: 'verticalLine' as const,
  }
} as const;
