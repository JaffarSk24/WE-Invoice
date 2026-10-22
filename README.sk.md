<p align="center">
  <img src="icon.png" width="112" alt="WE Invoice">
</p>

<h1 align="center">WE Invoice</h1>

<p align="center">
  <b>Bezplatná fakturácia a eFaktúra (Peppol) pre živnostníkov a malé firmy na Slovensku.</b><br>
  Faktúry s PAY by square, výkazy DPH a jednoduché účtovníctvo. Vaše údaje zostávajú zašifrované vo vašom vlastnom Google Drive.
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-dark.png" width="900" alt="Prehľad WE Invoice s ukážkovými dátami">
</p>

WE Invoice je tretia bezplatná aplikácia rady WE od [White Eagles](https://whiteeagles.sk/), po [WE Time Tracker](https://github.com/JaffarSk24/WE-Time-Tracker) a [WE Budget](https://github.com/JaffarSk24/WE-Budget). Robí to, za čo si platené fakturačné služby účtujú 5 až 15 € mesačne, bez taríf, bez limitov na kontakty, doklady či firmy a bez registrácie.

**Stiahnuť:** [webová aplikácia](https://jaffarsk24.github.io/WE-Invoice/app/) (dá sa nainštalovať aj do iPhonu a Androidu) · [macOS a Windows](https://github.com/JaffarSk24/WE-Invoice/releases/latest) · [web](https://jaffarsk24.github.io/WE-Invoice/sk/)

> **Verzia 0.1.3.** Všetky funkcie sú pokryté testami na počítači aj v telefóne. Daňové výkazy prechádzajú oficiálnymi schémami Finančnej správy a kontroluje ich účtovník, preto ich pred podaním skontrolujte. eFaktúra je v bete a otvára sa postupne ľuďom zo zoznamu čakateľov.

English version: [README.md](README.md).

## Prečo WE Invoice

- **Naozaj zadarmo.** Všetky funkcie pre všetkých: pravidelné faktúry, upomienky, import výpisov, viac firiem, všetky jazyky. White Eagles neprevádzkuje žiadne servery s vašimi dátami, takže nie je za čo platiť.
- **Vaše dáta patria vám.** Všetko sa šifruje vo vašom zariadení (AES-GCM 256) a ukladá do priečinka „WE Invoice“ vo vašom Google Drive. Kedykoľvek si všetko vyexportujete: JSON, XML, PDF, CSV.
- **Pripravené na eFaktúru 2027.** Od 1. januára 2027 vystavujú platitelia DPH tuzemské faktúry medzi podnikateľmi cez Peppol a každá firma ich musí vedieť prijať. WE Invoice ich posiela a prijíma cez certifikovaného poskytovateľa, ktorého si vyberiete.
- **Podľa slovenských zákonov.** Náležitosti podľa § 74 zákona o DPH sa kontrolujú pred vystavením dokladu; sadzby, limity, lehoty a texty zákonov sú v datovanej konfigurácii, nie v kóde.
- **Otvorený kód.** Licencia MIT: prečítajte si kód, overte, čo robí s vašimi dátami, zostavte si ho sami.

## Funkcie

- **Faktúry a ďalšie doklady:** faktúry, zálohové faktúry, daňové doklady k prijatej platbe, dobropisy a ťarchopisy, cenové ponuky, objednávky, dodacie listy a predajky s prevodmi medzi nimi a s prílohami.
- **PDF a QR platby:** štyri šablóny s vaším logom, pečiatkou a podpisom, tlač po slovensky, česky, anglicky, nemecky alebo dvojjazyčne, PAY by square na každej faktúre.
- **Klienti a ceny:** klienti z obchodného registra podľa IČO, kontrola VIES a spoľahlivosti platiteľa DPH, cenník s cenovými hladinami, pravidelné faktúry a upomienky odoslané v správny deň.
- **Banka a pokladňa:** import výpisov slovenských a českých bánk (CSV, CAMT.053, MT940, ABO/GPC) s automatickým párovaním, príkazy SEPA, pokladničná kniha a zápočet.
- **Nákup:** prijaté faktúry a výdavky z PDF, QR kódov, fotiek (OCR priamo v zariadení) a bločkov eKasa.
- **eFaktúra (beta):** odosielanie a prijímanie cez certifikovaného poskytovateľa vo formáte Peppol BIS 3.0 so slovenskými pravidlami, prílohy dokladu idú priamo v eFaktúre.
- **DPH a účtovníctvo:** Evidencia DPH, Kontrolný výkaz, Súhrnný výkaz a Priznanie k DPH ako XML podľa oficiálnych schém, jednoduché účtovníctvo živnostníka s majetkom, odpismi a uzávierkou.
- **Sklad a prehľady:** sklady a pohyby z dokladov, prehľady predaja a cash-flow, vekové členenie pohľadávok, vyhľadávanie, kôš a denník zmien.
- **Pre účtovníka:** export pre Pohodu, Money S3, Omegu, ISDOC a XLSX v jednom ZIP, migrácia z iných fakturačných aplikácií (aj SuperFaktúra cez API a objednávky zo Shoptetu), úplná záloha s heslom.
- **Všade:** aplikácia pre macOS a Windows s ikonou v lište a automatickými aktualizáciami a webová aplikácia, ktorú si nainštalujete do iPhonu aj Androidu a ktorá funguje offline. Rozhranie po slovensky, česky, anglicky, nemecky, rusky a ukrajinsky.

## Inštalácia

**Web a telefón:** otvorte [jaffarsk24.github.io/WE-Invoice/app](https://jaffarsk24.github.io/WE-Invoice/app/) a pridajte si ho na plochu (Safari: Zdieľať, Pridať na plochu; Chrome: Inštalovať aplikáciu). Po prvom spustení funguje aj offline.

**Počítač:** inštalátory sú v [poslednom vydaní](https://github.com/JaffarSk24/WE-Invoice/releases/latest). Aplikácia sa odtiaľ aktualizuje sama a každé stiahnutie overuje kontrolným súčtom sha512.

### macOS (10.15 a novší, Intel aj Apple silicon)

1. Stiahnite `WE-Invoice-<verzia>-mac-universal.dmg`, otvorte ho a presuňte WE Invoice do priečinka Aplikácie.
2. Pred prvým spustením raz zadajte v Termináli:

   ```bash
   xattr -cr "/Applications/WE Invoice.app"
   ```

   Aplikácia nie je notarizovaná spoločnosťou Apple a macOS by ju po stiahnutí z prehliadača odmietol spustiť; príkaz túto značku odstráni. Potom sa WE Invoice otvára ako každá iná aplikácia a jej aktualizácie tento krok nepotrebujú.

### Windows (10 a novší, 64-bit)

1. Stiahnite `WE-Invoice-<verzia>-win-x64.exe` a spustite ho. Nainštaluje sa len pre aktuálneho používateľa, bez práv správcu, so zástupcami na ploche a v ponuke Štart.
2. Inštalátor nie je podpísaný plateným certifikátom, preto SmartScreen zobrazí „Systém Windows ochránil váš počítač“. Kliknite na „Ďalšie informácie“ a potom „Spustiť aj tak“. Aktualizácie, ktoré si aplikácia nainštaluje sama, toto okno nezobrazujú. Windows 11 so zapnutým Smart App Control nepodpísané aplikácie nespustí vôbec, preto tam WE Invoice zatiaľ nainštalovať nejde.

## Súkromie a bezpečnosť

- Obchodné údaje sa nikdy nedostanú na server White Eagles. Šifrujú sa vo vašom zariadení náhodným kľúčom, ktorý chráni vaše heslo a 24-slovný obnovovací kľúč.
- Brána (`gateway/`) len sprostredkúva požiadavky, ktoré prehliadač nevie urobiť sám: verejné registre (RPO, ARES, VIES), kurzy ECB, bločky eKasa a vo webovej verzii volania vášho poskytovateľa Peppol. Kľúče poskytovateľa ňou prechádzajú len počas požiadavky a nikdy sa neukladajú ani nezapisujú do záznamov. Aplikácia pre počítač volá poskytovateľa priamo.
- V aplikácii nie je žiadna analytika ani sledovanie.

Podrobnosti sú v [zásadách ochrany osobných údajov](https://jaffarsk24.github.io/WE-Invoice/sk/privacy.html).

## Pre vývojárov

Architektúra, vývoj a testy sú opísané v [anglickom README](README.md#architecture).

## Licencia

MIT. WE Invoice vyvíja [White Eagles & Co. s. r. o.](https://whiteeagles.sk/)
