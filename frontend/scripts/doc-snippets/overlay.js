/**
 * Browser-side overlay injected into every recorded page.
 *
 * Headless screencasts contain no mouse cursor and no native drag image, so this
 * draws both: an arrow that follows mousemove/dragover, a ripple on mousedown, and
 * a translucent copy of the dragged element that travels with the pointer.
 * Everything is pointer-events:none so it never changes what the app receives.
 */

function installOverlay() {
  const Z = 2147483647;
  const ARROW =
    '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 1.5 L2 17 L6.2 13.2 L9 19.6 L11.8 18.4 L9.1 12.1 L14.8 12.1 Z" ' +
    'fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let cursor = null;
  let ghost = null;
  let ghostOffset = { x: 0, y: 0 };

  const ensureCursor = () => {
    if (cursor || !document.documentElement) return;
    cursor = document.createElement('div');
    cursor.innerHTML = ARROW;
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', width: '22px', height: '22px',
      pointerEvents: 'none', zIndex: String(Z), transform: 'translate(-100px, -100px)',
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
    });
    document.documentElement.appendChild(cursor);
  };

  const moveTo = (x, y) => {
    ensureCursor();
    if (cursor) cursor.style.transform = `translate(${x - 2}px, ${y - 1}px)`;
    if (ghost) ghost.style.transform = `translate(${x - ghostOffset.x}px, ${y - ghostOffset.y}px)`;
  };

  const ripple = (x, y) => {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: `${x - 18}px`, top: `${y - 18}px`, width: '36px', height: '36px',
      borderRadius: '50%', background: 'rgba(255, 152, 0, 0.45)', border: '2px solid rgba(255, 152, 0, 0.9)',
      pointerEvents: 'none', zIndex: String(Z - 1), transform: 'scale(0.3)', opacity: '1',
      transition: 'transform 450ms ease-out, opacity 450ms ease-out',
    });
    document.documentElement.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = 'scale(1)';
      dot.style.opacity = '0';
    });
    setTimeout(() => dot.remove(), 500);
  };

  const dropGhost = () => {
    if (ghost) ghost.remove();
    ghost = null;
  };

  window.addEventListener('mousemove', (e) => moveTo(e.clientX, e.clientY), true);
  window.addEventListener('mousedown', (e) => ripple(e.clientX, e.clientY), true);
  window.addEventListener('dragover', (e) => moveTo(e.clientX, e.clientY), true);
  window.addEventListener('dragstart', (e) => {
    const source = e.target instanceof Element ? e.target.closest('[draggable="true"]') : null;
    if (!source) return;
    const rect = source.getBoundingClientRect();
    // Shrink-wrapped, so a full-width list row travels as a compact chip held near its left edge.
    ghostOffset = { x: Math.min(e.clientX - rect.left, 24), y: e.clientY - rect.top };
    ghost = source.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'fixed', left: '0', top: '0', margin: '0', width: 'max-content', maxWidth: `${rect.width}px`,
      pointerEvents: 'none', zIndex: String(Z - 1), opacity: '0.85',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });
    document.documentElement.appendChild(ghost);
    moveTo(e.clientX, e.clientY);
  }, true);
  window.addEventListener('drop', dropGhost, true);
  window.addEventListener('dragend', dropGhost, true);
}

module.exports = { installOverlay };
