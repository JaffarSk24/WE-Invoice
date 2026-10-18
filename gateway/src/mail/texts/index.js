// Waitlist e-mail texts in the six product languages. Each language has
// the kinds "confirm" (double opt-in) and "invite" (beta code), each with
// subject, paragraphs, signature and footer. Placeholders: {confirmUrl},
// {unsubscribeUrl}, {hours}, {code}, {appUrl}. The notice to the owner
// about a new sign-up ("ownerNew") exists in English and Russian only;
// other languages fall back to English.
import sk from './sk.js';
import cs from './cs.js';
import en from './en.js';
import de from './de.js';
import ru from './ru.js';
import uk from './uk.js';

export const texts = { sk, cs, en, de, ru, uk };
export const MAIL_KINDS = ['confirm', 'invite'];
export const OWNER_KINDS = ['ownerNew'];
