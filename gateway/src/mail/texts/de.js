// German waitlist e-mails.
export default {
  confirm: {
    subject: 'Bestätigen Sie Ihre E-Mail-Adresse für WE Invoice',
    paragraphs: [
      'Guten Tag,',
      'vielen Dank für Ihr Interesse an WE Invoice, der kostenlosen Rechnungsstellung und E-Rechnung für slowakische und tschechische Unternehmen. Bitte bestätigen Sie Ihre E-Mail-Adresse über diesen Link:',
      '{confirmUrl}',
      'Der Link ist {hours} Stunden gültig. Falls Sie sich nicht eingetragen haben, ignorieren Sie diese E-Mail: eine unbestätigte Adresse wird automatisch gelöscht.'
    ],
    signature: 'Mit freundlichen Grüßen\nIhr WE-Invoice-Team\nWhite Eagles & Co. s. r. o.',
    footer: 'Abmelden und Daten löschen: {unsubscribeUrl}'
  },
  invite: {
    subject: 'Sie sind in der E-Rechnungs-Beta von WE Invoice',
    paragraphs: [
      'Guten Tag,',
      'wir öffnen die nächste Welle der geschlossenen E-Rechnungs-Beta (Peppol) in WE Invoice und haben einen Platz für Sie. Ihr Einladungscode:',
      '{code}',
      'Öffnen Sie die App unter {appUrl}, gehen Sie zu Einstellungen, eFaktúra, Einladungscode und geben Sie den Code ein. Der Code ist nur für Sie bestimmt; Sie können ihn auch auf einem zweiten Gerät verwenden.',
      'Zum Versand von E-Rechnungen benötigen Sie ein Konto bei einem zertifizierten Anbieter (digitálny poštár). Der Assistent in der App führt Sie durch die Verbindung.'
    ],
    signature: 'Mit freundlichen Grüßen\nIhr WE-Invoice-Team\nWhite Eagles & Co. s. r. o.',
    footer: 'Abmelden und Daten löschen: {unsubscribeUrl}'
  }
};
