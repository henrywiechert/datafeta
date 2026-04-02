import React from 'react';

const BREAK_CHARS = ['_', '.'];

/**
 * Renders a label string with <wbr> elements inserted after each preferred
 * break character ('_', '.'), so the browser wraps there before falling back
 * to arbitrary mid-token breaks.
 */
export function renderWithBreaks(label: string): React.ReactNode {
  const pattern = new RegExp(`([${BREAK_CHARS.map(c => `\\${c}`).join('')}])`, 'g');
  const parts = label.split(pattern);
  if (parts.length === 1) return label;
  return (
    <>
      {parts.map((part, i) =>
        BREAK_CHARS.includes(part)
          ? <React.Fragment key={i}>{part}<wbr /></React.Fragment>
          : part
      )}
    </>
  );
}
