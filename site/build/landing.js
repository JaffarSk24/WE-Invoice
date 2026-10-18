// The landing page body: hero, the eFaktura 2027 block with the waitlist
// form, nine feature cards, the comparison table, privacy, the three
// connection steps, the FAQ and the White Eagles block. Section ids are the
// contract the tests check across languages.
import { RELEASES_URL, WAITLIST_URL, INTERESTS } from './config.js';
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
    `    <div class="shot"><img src="../assets/preview.png" width="1440" height="900" alt="${attr(h.shotAlt)}" fetchpriority="high" decoding="async"></div>`,
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

function waitlistForm(code, f) {
  const msgs = Object.entries(f.msg).map(([k, v]) => ` data-msg-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${attr(v)}"`).join('');
  const interests = INTERESTS.map(i => `<label class="check"><input type="checkbox" name="interests" value="${i.value}"> ${text(f.interests[i.key])}</label>`);
  return lines(
    `<form class="waitlist" id="waitlist-form" action="${WAITLIST_URL}" method="post" novalidate data-sending="${attr(f.sending)}"${msgs}>`,
    `  <h3 id="waitlist-title">${text(f.title)}</h3>`,
    `  <p>${text(f.intro)}</p>`,
    `  <input type="hidden" name="lang" value="${code}">`,
    '  <input type="hidden" name="source" value="site">',
    '  <input type="hidden" name="startedAt" value="">',
    '  <div class="field">',
    `    <label for="wl-email">${text(f.email)}</label>`,
    `    <input id="wl-email" name="email" type="email" required autocomplete="email" inputmode="email" maxlength="320" placeholder="${attr(f.emailPlaceholder)}">`,
    '  </div>',
    '  <fieldset>',
    `    <legend>${text(f.interests.legend)}</legend>`,
    indent(interests.join('\n'), 4),
    '  </fieldset>',
    '  <fieldset>',
    `    <legend>${text(f.vat.legend)}</legend>`,
    `    <label class="check"><input type="radio" name="vatPayer" value="true"> ${text(f.vat.yes)}</label>`,
    `    <label class="check"><input type="radio" name="vatPayer" value="false"> ${text(f.vat.no)}</label>`,
    '  </fieldset>',
    '  <div class="hp" aria-hidden="true">',
    '    <label for="wl-website">Website</label>',
    '    <input id="wl-website" name="website" type="text" tabindex="-1" autocomplete="off">',
    '  </div>',
    `  <label class="check consent-check"><input type="checkbox" name="consent" value="true" required> <span>${inline(f.consent)}</span></label>`,
    `  <button type="submit" class="btn primary">${text(f.submit)}</button>`,
    '  <p class="form-status" role="status" aria-live="polite"></p>',
    `  <p class="note">${text(f.note)}</p>`,
    '</form>'
  );
}

function efaktura(code, e, f) {
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
    `    <p class="buttons"><a class="btn primary" href="#waitlist">${text(e.cta)}</a></p>`,
    '    <div class="waitlist-wrap" id="waitlist">',
    indent(waitlistForm(code, f), 6),
    '    </div>',
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

export function landingBody(code, l) {
  return lines(
    hero(l.hero),
    efaktura(code, l.efaktura, l.form),
    features(l.features),
    compare(l.compare),
    privacy(l.privacy),
    connect(l.connect),
    faq(l.faq),
    agency(l.we)
  );
}
