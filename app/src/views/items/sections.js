// Extra sections of the item card that other packages add without this
// package knowing them: the stock package (WP-STOCK) registers its stock
// levels and price levels here. render(container, { item, readOnly })
// draws into the given element; a failing section is reported and the
// rest of the card still works.
const sections = [];

export function registerItemSection(render, { id = null, order = 100 } = {}) {
  if (typeof render !== 'function') throw new Error('An item section needs a render function');
  const key = id || `section-${sections.length + 1}`;
  const existing = sections.findIndex(s => s.id === key);
  const entry = { id: key, order, render };
  if (existing >= 0) sections[existing] = entry; else sections.push(entry);
  sections.sort((a, b) => a.order - b.order);
  return () => { const i = sections.indexOf(entry); if (i >= 0) sections.splice(i, 1); };
}

export function itemSections() {
  return sections.slice();
}

// Draws every registered section into its own container.
export function renderItemSections(host, context, createContainer) {
  sections.forEach(s => {
    const box = createContainer(s.id);
    host.append(box);
    try {
      s.render(box, context);
    } catch (e) {
      console.error(`Item section ${s.id} failed`, e);
    }
  });
}

// For tests.
export function resetItemSections() {
  sections.length = 0;
}
