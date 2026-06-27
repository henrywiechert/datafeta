// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill Web Crypto API for Jest (JSDOM) environment.
// uuid v14+ uses crypto.getRandomValues which is not exposed in JSDOM by default.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require('crypto');
if (typeof (global as any).crypto === 'undefined') {
  (global as any).crypto = nodeCrypto.webcrypto;
}

// Polyfill TextEncoder/TextDecoder for Jest (node) environment.
// Some dependencies (e.g. apache-arrow) expect these globals.
// CRA/Jest in some node versions does not provide them by default.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require('util');
if (typeof (global as any).TextDecoder === 'undefined') {
  (global as any).TextDecoder = util.TextDecoder;
}
if (typeof (global as any).TextEncoder === 'undefined') {
  (global as any).TextEncoder = util.TextEncoder;
}
