// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
// Color scheme definitions for data visualization
// Based on ColorBrewer and popular visualization libraries

export type ColorSchemeType = 'categorical' | 'sequential' | 'diverging';

export interface ColorScheme {
  id: string;
  name: string;
  type: ColorSchemeType;
  colors: string[];
  description?: string;
}

// Categorical color schemes (for discrete data)
export const categoricalSchemes: ColorScheme[] = [
  {
    id: 'tableau10',
    name: 'Tableau 10',
    type: 'categorical',
    colors: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'],
    description: 'Default Tableau color scheme',
  },
  {
    id: 'category10',
    name: 'Category 10',
    type: 'categorical',
    colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
    description: 'D3 category colors',
  },
  {
    id: 'accent',
    name: 'Accent',
    type: 'categorical',
    colors: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
    description: 'Soft accent colors',
  },
  {
    id: 'dark2',
    name: 'Dark 2',
    type: 'categorical',
    colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    description: 'Dark categorical colors',
  },
  {
    id: 'set1',
    name: 'Set 1',
    type: 'categorical',
    colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
    description: 'Vivid colors for categories',
  },
  {
    id: 'set2',
    name: 'Set 2',
    type: 'categorical',
    colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    description: 'Pastel categorical colors',
  },
  {
    id: 'set3',
    name: 'Set 3',
    type: 'categorical',
    colors: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
    description: 'Light categorical colors',
  },
  {
    id: 'pastel1',
    name: 'Pastel 1',
    type: 'categorical',
    colors: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
    description: 'Soft pastel colors',
  },
  {
    id: 'tableau20',
    name: 'Tableau 20',
    type: 'categorical',
    colors: [
      '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
      '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
      '#a0cbe8', '#ffbe7d', '#ff9d9a', '#acd7c5', '#8cd17d',
      '#f1ce63', '#d4a6c8', '#fabfd2', '#d7b5a6', '#d4d4d4'
    ],
    description: 'Extended Tableau color scheme with 20 colors',
  },
];

// Sequential color schemes (for continuous data)
export const sequentialSchemes: ColorScheme[] = [
  {
    id: 'blues',
    name: 'Blues',
    type: 'sequential',
    colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    description: 'Blue gradient',
  },
  {
    id: 'greens',
    name: 'Greens',
    type: 'sequential',
    colors: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
    description: 'Green gradient',
  },
  {
    id: 'oranges',
    name: 'Oranges',
    type: 'sequential',
    colors: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
    description: 'Orange gradient',
  },
  {
    id: 'reds',
    name: 'Reds',
    type: 'sequential',
    colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
    description: 'Red gradient',
  },
  {
    id: 'purples',
    name: 'Purples',
    type: 'sequential',
    colors: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
    description: 'Purple gradient',
  },
  {
    id: 'viridis',
    name: 'Viridis',
    type: 'sequential',
    colors: ['#440154', '#482777', '#3f4a8a', '#31678e', '#26838f', '#1f9d8a', '#6cce5a', '#b6de2b', '#fee825'],
    description: 'Perceptually uniform',
  },
  {
    id: 'plasma',
    name: 'Plasma',
    type: 'sequential',
    colors: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
    description: 'Perceptually uniform',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    type: 'sequential',
    colors: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
    description: 'Perceptually uniform',
  },
];

// Diverging color schemes (for data with a meaningful midpoint)
export const divergingSchemes: ColorScheme[] = [
  {
    id: 'rdbu',
    name: 'Red-Blue',
    type: 'diverging',
    colors: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
    description: 'Red to blue diverging',
  },
  {
    id: 'rdgy',
    name: 'Red-Gray',
    type: 'diverging',
    colors: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a'],
    description: 'Red to gray diverging',
  },
  {
    id: 'brbg',
    name: 'Brown-Blue Green',
    type: 'diverging',
    colors: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
    description: 'Brown to blue-green',
  },
  {
    id: 'piyg',
    name: 'Pink-Yellow Green',
    type: 'diverging',
    colors: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419'],
    description: 'Pink to yellow-green',
  },
  {
    id: 'spectral',
    name: 'Spectral',
    type: 'diverging',
    colors: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
    description: 'Spectral diverging',
  },
];

// All schemes combined
export const allSchemes: ColorScheme[] = [
  ...categoricalSchemes,
  ...sequentialSchemes,
  ...divergingSchemes,
];

// Get scheme by ID
export const getSchemeById = (id: string): ColorScheme | undefined => {
  return allSchemes.find(scheme => scheme.id === id);
};

// Get schemes by type
export const getSchemesByType = (type: ColorSchemeType): ColorScheme[] => {
  return allSchemes.filter(scheme => scheme.type === type);
};

// Default scheme IDs
export const DEFAULT_CATEGORICAL_SCHEME = 'tableau10';
export const DEFAULT_SEQUENTIAL_SCHEME = 'blues';
export const DEFAULT_DIVERGING_SCHEME = 'rdbu';

// Predefined quick-pick colors (Tableau 10)
export const PREDEFINED_COLORS: string[] = categoricalSchemes[0].colors;

// Default manual color (first color from predefined colors)
export const DEFAULT_MANUAL_COLOR = PREDEFINED_COLORS[0]; // '#4e79a7'
