// Slovak waitlist e-mails.
export default {
  confirm: {
    subject: 'Potvrďte svoj e-mail pre WE Invoice',
    paragraphs: [
      'Dobrý deň,',
      'ďakujeme za záujem o WE Invoice, bezplatnú fakturáciu a eFaktúru pre slovenských a českých podnikateľov. Potvrďte prosím svoju e-mailovú adresu kliknutím na tento odkaz:',
      '{confirmUrl}',
      'Odkaz platí {hours} hodín. Ak ste sa na zoznam nezapísali vy, tento e-mail ignorujte: adresa bez potvrdenia sa automaticky vymaže.'
    ],
    signature: 'S pozdravom\ntím WE Invoice\nWhite Eagles & Co. s. r. o.',
    footer: 'Odhlásiť sa a vymazať údaje: {unsubscribeUrl}'
  },
  invite: {
    subject: 'Ste v bete eFaktúry WE Invoice',
    paragraphs: [
      'Dobrý deň,',
      'otvárame ďalšiu vlnu uzavretej bety eFaktúry (Peppol) vo WE Invoice a máme pre vás miesto. Váš kód pozvánky:',
      '{code}',
      'Otvorte aplikáciu {appUrl}, prejdite do Nastavenia, eFaktúra, Kód pozvánky a kód vložte. Kód je určený len pre vás; môžete ho použiť aj na druhom zariadení.',
      'Na odosielanie eFaktúr potrebujete účet u certifikovaného poskytovateľa (digitálny poštár). Sprievodca v aplikácii vás pripojením prevedie.'
    ],
    signature: 'S pozdravom\ntím WE Invoice\nWhite Eagles & Co. s. r. o.',
    footer: 'Odhlásiť sa a vymazať údaje: {unsubscribeUrl}'
  }
};
