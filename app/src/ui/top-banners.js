// The stack of banners over the page (sync, updates): one container outside
// the redrawn shell, so banners never overlap and survive navigation.
// Without a document (tests of start-up modules) there is no banner: null.
export function topBanner(id, role = 'status') {
  if (typeof document === 'undefined') return null;
  let stack = document.getElementById('top-banners');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'top-banners';
    stack.className = 'top-banners';
    document.body.appendChild(stack);
  }
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'update-banner';
    el.setAttribute('role', role);
    el.hidden = true;
    stack.appendChild(el);
  }
  return el;
}
