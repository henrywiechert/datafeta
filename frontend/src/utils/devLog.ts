// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

// Tree-shakeable in production builds via NODE_ENV constant folding (CRA does
// this via webpack DefinePlugin).
const isDev = process.env.NODE_ENV !== 'production';

export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};

export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
};
