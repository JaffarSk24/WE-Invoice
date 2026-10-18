// Czech waitlist e-mails.
export default {
  confirm: {
    subject: 'Potvrďte svůj e-mail pro WE Invoice',
    paragraphs: [
      'Dobrý den,',
      'děkujeme za zájem o WE Invoice, bezplatnou fakturaci a eFakturu pro slovenské a české podnikatele. Potvrďte prosím svou e-mailovou adresu kliknutím na tento odkaz:',
      '{confirmUrl}',
      'Odkaz platí {hours} hodin. Pokud jste se na seznam nezapsali vy, tento e-mail ignorujte: adresa bez potvrzení se automaticky smaže.'
    ],
    signature: 'S pozdravem\ntým WE Invoice\nWhite Eagles & Co. s. r. o.',
    footer: 'Odhlásit se a smazat údaje: {unsubscribeUrl}'
  },
  invite: {
    subject: 'Jste v betě eFaktury WE Invoice',
    paragraphs: [
      'Dobrý den,',
      'otevíráme další vlnu uzavřené bety eFaktury (Peppol) ve WE Invoice a máme pro vás místo. Váš kód pozvánky:',
      '{code}',
      'Otevřete aplikaci {appUrl}, přejděte do Nastavení, eFaktura, Kód pozvánky a kód vložte. Kód je určen jen pro vás; můžete ho použít i na druhém zařízení.',
      'K odesílání eFaktur potřebujete účet u certifikovaného poskytovatele (digitální pošťák). Průvodce v aplikaci vás připojením provede.'
    ],
    signature: 'S pozdravem\ntým WE Invoice\nWhite Eagles & Co. s. r. o.',
    footer: 'Odhlásit se a smazat údaje: {unsubscribeUrl}'
  }
};
