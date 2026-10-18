// English waitlist e-mails.
export default {
  confirm: {
    subject: 'Confirm your e-mail for WE Invoice',
    paragraphs: [
      'Hello,',
      'thank you for your interest in WE Invoice, free invoicing and e-invoicing for Slovak and Czech businesses. Please confirm your e-mail address by opening this link:',
      '{confirmUrl}',
      'The link is valid for {hours} hours. If you did not sign up, ignore this e-mail: an unconfirmed address is deleted automatically.'
    ],
    signature: 'Kind regards\nthe WE Invoice team\nWhite Eagles & Co. s. r. o.',
    footer: 'Unsubscribe and delete your data: {unsubscribeUrl}'
  },
  invite: {
    subject: 'You are in the WE Invoice e-invoicing beta',
    paragraphs: [
      'Hello,',
      'we are opening the next wave of the closed e-invoicing (Peppol) beta in WE Invoice and have a place for you. Your invite code:',
      '{code}',
      'Open the app at {appUrl}, go to Settings, eFaktúra, Invite code and enter the code. The code is meant for you only; you may use it on a second device too.',
      'To send e-invoices you need an account with a certified provider (digitálny poštár). The wizard in the app walks you through the connection.'
    ],
    signature: 'Kind regards\nthe WE Invoice team\nWhite Eagles & Co. s. r. o.',
    footer: 'Unsubscribe and delete your data: {unsubscribeUrl}'
  }
};
