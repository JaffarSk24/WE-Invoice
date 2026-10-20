// Showing a PDF blob on the page. An iframe works only when the page's
// Content-Security-Policy lets frames load blob: URLs; otherwise the PDF
// opens in a new tab (navigation is not limited by frame-src), and when
// the browser blocks the tab it is downloaded instead, so the user always
// gets the document.

/** Whether a CSP allows frames from blob: URLs (frame-src, else child-src, else default-src). */
export function cspAllowsBlobFrames(policy) {
  if (!policy) return true;
  const directives = new Map(policy.split(';').map(d => d.trim().split(/\s+/)).filter(p => p[0]).map(([name, ...values]) => [name.toLowerCase(), values]));
  const values = directives.get('frame-src') || directives.get('child-src') || directives.get('default-src');
  return !values || values.includes('blob:') || values.includes('*');
}

export function canFrameBlobs(doc = typeof document !== 'undefined' ? document : null) {
  const meta = doc && doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  return cspAllowsBlobFrames(meta ? meta.getAttribute('content') : null);
}

/** Opens a file in a new tab (the browser shows PDFs and images, downloads the rest), or downloads it when the tab is blocked. */
export function openBlob(blob, name = 'file') {
  const url = URL.createObjectURL(blob);
  // Without "noopener" in the features: with it window.open answers null
  // even when the tab opened, and the file would be downloaded as well.
  const tab = window.open(url, '_blank');
  if (tab) tab.opener = null;
  else {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Opens a PDF in a new tab, or downloads it when the tab is blocked. */
export function openPdf(blob, name = 'document.pdf') {
  openBlob(blob, name);
}
