// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

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

// Polyfill globalThis.crypto for Jest (node) environment.
// uuid v14+ requires the Web Crypto API which jsdom does not expose by default.
if (typeof (global as any).crypto === 'undefined') {
  (global as any).crypto = require('crypto').webcrypto;
}

// Polyfill PointerEvent for Jest (jsdom) environment.
// jsdom does not implement PointerEvent, so @testing-library's fireEvent.pointer*
// falls back to a generic Event that drops MouseEvent init fields like `button`
// and `clientX`. Components that guard on `e.button` (e.g. primary-button-only
// drag handles) then behave differently under test than in a real browser.
// Subclassing MouseEvent preserves those init fields.
if (typeof (global as any).PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    public pointerId?: number;
    public pointerType?: string;
    public isPrimary?: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId;
      this.pointerType = params.pointerType;
      this.isPrimary = params.isPrimary;
    }
  }
  (global as any).PointerEvent = PointerEvent;
  if (typeof window !== 'undefined') {
    (window as any).PointerEvent = PointerEvent;
  }
}

