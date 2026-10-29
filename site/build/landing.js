// The landing page body: hero, the eFaktura 2027 block with the call to
// turn eFaktura on in the app, nine feature cards, the comparison table,
// privacy, the three connection steps, the FAQ and the White Eagles block.
// Section ids are the contract the tests check across languages.
import { RELEASES_URL } from './config.js';
import { text, inline, attr, lines, indent } from './html.js';
import { icon, FEATURE_ICONS, EFAKTURA_ICONS, PRIVACY_ICONS } from './icons.js';

function hero(h) {
  return lines(
    '<section class="hero" id="hero">',
    '  <div class="wrap">',
    `    <h1>${text(h.h1)}</h1>`,
    `    <p class="lead">${text(h.lead)}</p>`,
    '    <div class="buttons">',
    `      <a class="btn primary" href="../app/">${text(h.ctaApp)}</a>`,
    `      <a class="btn" href="${RELEASES_URL}" rel="noopener">${text(h.ctaDownload)}</a>`,
    '    </div>',
    `    <p class="hint">${text(h.hint)}</p>`,
    '    <div class="shot">',
    '      <picture>',
    '        <source type="image/webp" srcset="../assets/preview-720.webp 720w, ../assets/preview-1440.webp 1440w" sizes="(max-width: 720px) 100vw, 1040px">',
    `        <img src="../assets/preview.png" width="1440" height="900" alt="${attr(h.shotAlt)}" fetchpriority="high" decoding="async">`,
    '      </picture>',
    '    </div>',
    '  </div>',
    '</section>'
  );
}

function cards(items, icons, className = 'card') {
  return items.map((it, i) => lines(
    `<div class="${className}">`,
    icons ? `  <span class="icon">${icon(icons[i])}</span>` : '',
    `  <h3>${text(it.title)}</h3>`,
    `  <p>${inline(it.text)}</p>`,
    '</div>'
  )).join('\n');
}

// eFaktura is open to everyone: the block sends the visitor to the app,
// where the provider's key goes into Settings, eFaktura.
function startPanel(e) {
  const st = e.start;
  return lines(
    '<div class="start" id="start">',
    `  <h3>${text(st.title)}</h3>`,
    `  <p>${text(st.intro)}</p>`,
    '  <ol class="start-steps">',
    indent(st.steps.map(step => `<li>${inline(step)}</li>`).join('\n'), 4),
    '  </ol>',
    `  <p class="buttons"><a class="btn primary" href="../app/">${text(e.cta)}</a></p>`,
    `  <p class="note">${text(st.price)}</p>`,
    '</div>'
  );
}

function efaktura(e) {
  return lines(
    '<section class="block efaktura" id="efaktura">',
    '  <div class="wrap">',
    `    <p class="badge">${text(e.badge)}</p>`,
    `    <h2>${text(e.h2)}</h2>`,
    `    <p class="intro">${inline(e.intro)}</p>`,
    '    <div class="grid three">',
    indent(cards(e.cards, EFAKTURA_ICONS), 6),
    '    </div>',
    `    <p class="help">${inline(e.help)}</p>`,
    indent(startPanel(e), 4),
    '  </div>',
    '</section>'
  );
}

function features(f) {
  return lines(
    '<section class="block" id="features">',
    '  <div class="wrap">',
    `    <h2>${text(f.h2)}</h2>`,
    `    <p class="intro">${text(f.intro)}</p>`,
    '    <div class="grid">',
    indent(cards(f.items, FEATURE_ICONS), 6),
    '    </div>',
    '  </div>',
    '</section>'
  );
}

function compare(c) {
  const rows = c.rows.map(r => lines(
    '<tr>',
    `  <th scope="row">${text(r.feature)}</th>`,
    `  <td data-label="${attr(c.colUs)}">${text(r.us)}</td>`,
    `  <td data-label="${attr(c.colOther)}">${text(r.other)}</td>`,
    '</tr>'
  )).join('\n');
  return lines(
    '<section class="block" id="compare">',
    '  <div class="wrap">',
    `    <h2>${text(c.h2)}</h2>`,
    `    <p class="intro">${text(c.intro)}</p>`,
    '    <div class="table-wrap">',
    '      <table class="compare">',
    `        <thead><tr><th scope="col">${text(c.colFeature)}</th><th scope="col" class="us">${text(c.colUs)}</th><th scope="col">${text(c.colOther)}</th></tr></thead>`,
    '        <tbody>',
    indent(rows, 10),
    '        </tbody>',
    '      </table>',
    '    </div>',
    `    <p class="note">${text(c.note)}</p>`,
    '  </div>',
    '</section>'
  );
}

function privacy(p) {
  return lines(
    '<section class="block privacy-note" id="privacy">',
    '  <div class="wrap">',
    `    <h2>${text(p.h2)}</h2>`,
    '    <div class="grid three">',
    indent(cards(p.items, PRIVACY_ICONS), 6),
    '    </div>',
    `    <p><a href="./privacy.html">${text(p.link)}</a></p>`,
    '  </div>',
    '</section>'
  );
}

function connect(c) {
  const steps = c.steps.map(s => lines('<li>', `  <h3>${text(s.title)}</h3>`, `  <p>${inline(s.text)}</p>`, '</li>')).join('\n');
  return lines(
    '<section class="block" id="connect">',
    '  <div class="wrap">',
    `    <h2>${text(c.h2)}</h2>`,
    `    <p class="intro">${text(c.intro)}</p>`,
    '    <ol class="steps">',
    indent(steps, 6),
    '    </ol>',
    `    <p class="note">${text(c.note)}</p>`,
    '  </div>',
    '</section>'
  );
}

function faq(f) {
  const items = f.items.map(it => lines(
    '<details>',
    `  <summary>${text(it.q)}</summary>`,
    `  <p>${inline(it.a)}</p>`,
    '</details>'
  )).join('\n');
  return lines(
    '<section class="block" id="faq">',
    '  <div class="wrap narrow">',
    `    <h2>${text(f.h2)}</h2>`,
    indent(items, 4),
    '  </div>',
    '</section>'
  );
}

function agency(w) {
  return lines(
    '<section class="block agency" id="white-eagles">',
    '  <div class="wrap narrow">',
    `    <h2>${text(w.h2)}</h2>`,
    `    <p>${text(w.text)}</p>`,
    `    <p><a class="btn" href="https://whiteeagles.sk/" rel="noopener">${text(w.cta)}</a></p>`,
    '  </div>',
    '</section>'
  );
}

export function landingBody(l) {
  return lines(
    hero(l.hero),
    efaktura(l.efaktura),
    features(l.features),
    compare(l.compare),
    privacy(l.privacy),
    connect(l.connect),
    faq(l.faq),
    agency(l.we)
  );
}
