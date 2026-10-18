// HTML of the product picture in the hero (1440 x 900): the WE Invoice
// shell with an invoice list and an invoice preview, drawn with the app's
// design tokens. Sample data only; the companies and amounts are invented.
import { readFileSync } from 'node:fs';
import { fontFaces } from './fonts.js';

const ICON = `data:image/png;base64,${readFileSync(new URL('../assets/icon-512.png', import.meta.url)).toString('base64')}`;

const NAV = ['Prehľad', 'Faktúry', 'Kontakty', 'Výdavky', 'Banka', 'eFaktúra', 'Účtovníctvo', 'Nastavenia'];
const ROWS = [
  ['2026/0147', 'Kvetinárstvo Nela', '14. 10. 2026', '28. 10. 2026', '1 236,00 €', 'Odoslaná', '#818cf8'],
  ['2026/0146', 'Peter Hudák', '12. 10. 2026', '26. 10. 2026', '480,00 €', 'Zaplatená', '#10b981'],
  ['2026/0145', 'Studio Vlna', '9. 10. 2026', '23. 10. 2026', '2 150,40 €', 'Po splatnosti', '#f43f5e'],
  ['2026/0144', 'Autoservis Kubo', '6. 10. 2026', '20. 10. 2026', '312,00 €', 'Zaplatená', '#10b981'],
  ['2026/0143', 'MUDr. Jana Bieliková', '2. 10. 2026', '16. 10. 2026', '96,00 €', 'Doručená', '#22c55e'],
  ['2026/0142', 'Pekáreň Lúka', '30. 9. 2026', '14. 10. 2026', '728,50 €', 'Zaplatená', '#10b981']
];
const LINES = [['Grafický návrh letáku', '1', '450,00'], ['Tlač 2 000 ks', '1', '580,00']];

// A deterministic pseudo QR pattern, so the preview needs no library.
function qr() {
  let seed = 7;
  const cells = [];
  for (let i = 0; i < 21 * 21; i++) {
    seed = (seed * 48271) % 2147483647;
    cells.push(seed % 3 === 0 ? '<i></i>' : '<i class="w"></i>');
  }
  return cells.join('');
}

export function previewHtml() {
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<style>
${fontFaces()}
html, body { margin: 0; width: 1440px; height: 900px; overflow: hidden; }
body { display: flex; background: #090b11; color: #fff; font: 15px/1.5 'Inter', sans-serif; }
.sidebar { width: 260px; background: rgba(10, 12, 18, 0.85); border-right: 1px solid rgba(255,255,255,0.08); padding: 24px 16px; box-sizing: border-box; }
.brand { display: flex; align-items: center; gap: 12px; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 20px; margin: 0 8px 28px; }
.brand img { width: 36px; height: 36px; border-radius: 10px; }
.nav div { padding: 11px 14px; border-radius: 12px; color: #94a3b8; margin-bottom: 4px; display: flex; align-items: center; gap: 12px; }
.nav div::before { content: ""; width: 18px; height: 18px; border-radius: 5px; background: currentColor; opacity: 0.35; }
.nav div.on { background: rgba(79, 172, 254, 0.12); color: #fff; }
.main { flex: 1; padding: 28px 28px 28px 32px; box-sizing: border-box; min-width: 0; overflow: hidden; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
h1 { margin: 0; font-family: 'Outfit', sans-serif; font-size: 28px; }
.btn { padding: 11px 20px; border-radius: 12px; background: linear-gradient(135deg, #00f2fe, #4facfe); color: #04121f; font-weight: 700; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 22px; }
.card { background: rgba(22, 27, 41, 0.65); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px 18px; }
.card small { color: #94a3b8; display: block; margin-bottom: 6px; }
.card strong { font-size: 24px; font-family: 'Outfit', sans-serif; }
.card strong.bad { color: #f43f5e; }
table { width: 100%; border-collapse: collapse; background: rgba(22, 27, 41, 0.65); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; }
th, td { text-align: left; padding: 12px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); white-space: nowrap; font-size: 14px; }
th { color: #8391a7; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
td.r, th.r { text-align: right; }
.st { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; }
.st::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
.aside { width: 400px; flex-shrink: 0; padding: 28px 28px 28px 0; box-sizing: border-box; }
.doc { background: #fff; color: #0f172a; border-radius: 14px; padding: 26px; box-sizing: border-box; font-size: 13px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
.doc h2 { margin: 0 0 2px; font-size: 22px; font-family: 'Outfit', sans-serif; }
.doc .muted { color: #64748b; }
.doc .two { display: flex; justify-content: space-between; gap: 16px; margin: 18px 0; }
.doc table { background: none; border: 0; border-radius: 0; margin-top: 8px; }
.doc th { color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
.doc td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; }
.total { display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; margin-top: 10px; }
.pay { display: flex; gap: 16px; align-items: center; margin-top: 22px; }
.qr { display: grid; grid-template-columns: repeat(21, 5px); gap: 0; width: 105px; height: 105px; }
.qr i { display: block; width: 5px; height: 5px; background: #0f172a; }
.qr i.w { background: #fff; }
.sig { margin-top: 18px; color: #94a3b8; font-size: 11px; }
</style>
</head>
<body>
<aside class="sidebar">
  <div class="brand"><img src="${ICON}" alt="">WE Invoice</div>
  <div class="nav">${NAV.map((n, i) => `<div${i === 1 ? ' class="on"' : ''}>${n}</div>`).join('')}</div>
</aside>
<main class="main">
  <div class="head"><h1>Faktúry</h1><span class="btn">+ Nová faktúra</span></div>
  <div class="cards">
    <div class="card"><small>Nezaplatené</small><strong>3 386,40 €</strong></div>
    <div class="card"><small>Po splatnosti</small><strong class="bad">2 150,40 €</strong></div>
    <div class="card"><small>Vystavené tento mesiac</small><strong>4 274,40 €</strong></div>
  </div>
  <table>
    <thead><tr><th>Číslo</th><th>Odberateľ</th><th>Vystavená</th><th>Splatnosť</th><th class="r">Suma</th><th>Stav</th></tr></thead>
    <tbody>${ROWS.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td class="r">${r[4]}</td><td><span class="st" style="color:${r[6]}">${r[5]}</span></td></tr>`).join('')}</tbody>
  </table>
</main>
<section class="aside">
  <div class="doc">
    <h2>Faktúra 2026/0147</h2>
    <div class="muted">Dátum vystavenia 14. 10. 2026, splatnosť 28. 10. 2026</div>
    <div class="two">
      <div><div class="muted">Dodávateľ</div><strong>Dizajn Mira s. r. o.</strong><br>Hlavná 12, 040 01 Košice<br>IČO 12345678, IČ DPH SK2020123456</div>
      <div><div class="muted">Odberateľ</div><strong>Kvetinárstvo Nela s. r. o.</strong><br>Ružová 3, 010 01 Žilina<br>IČO 87654321</div>
    </div>
    <table><thead><tr><th>Položka</th><th class="r">Množ.</th><th class="r">Cena bez DPH</th></tr></thead>
    <tbody>${LINES.map(l => `<tr><td>${l[0]}</td><td class="r">${l[1]}</td><td class="r">${l[2]} €</td></tr>`).join('')}</tbody></table>
    <div class="two" style="margin:10px 0 0"><span class="muted">Základ 1 030,00 € + DPH 23 % 206,00 €</span></div>
    <div class="total"><span>Spolu na úhradu</span><span>1 236,00 €</span></div>
    <div class="pay"><div class="qr">${qr()}</div><div><strong>PAY by square</strong><br><span class="muted">IBAN SK31 1200 0000 1987 4263 7541<br>VS 20260147</span></div></div>
    <div class="sig">Vystavené vo WE Invoice</div>
  </div>
</section>
</body>
</html>`;
}
