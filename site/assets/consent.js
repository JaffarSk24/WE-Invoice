// Cookie consent and analytics. Google Consent Mode v2: every storage type
// starts denied; the banner asks once; Google Analytics 4 is loaded only
// after the visitor agrees and only when a measurement id is configured.
// The choice is kept in localStorage so the banner does not come back.
import { GA4_MEASUREMENT_ID, CONSENT_KEY } from './config.js';

const DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
const GRANTED = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };

window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

function readChoice() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function saveChoice(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* storage blocked: the banner will ask again */ }
}

let loaded = false;
function loadAnalytics() {
  if (loaded || !GA4_MEASUREMENT_ID) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
  gtag('js', new Date());
  gtag('config', GA4_MEASUREMENT_ID, { anonymize_ip: true });
}

function apply(choice) {
  if (choice === 'granted') {
    gtag('consent', 'update', GRANTED);
    loadAnalytics();
  } else {
    gtag('consent', 'update', DENIED);
  }
}

function init() {
  gtag('consent', 'default', { ...DENIED, wait_for_update: 500 });
  const banner = document.getElementById('consent');
  if (!banner) return;
  const choice = readChoice();
  if (choice === 'granted' || choice === 'denied') apply(choice);
  else banner.hidden = false;

  banner.querySelectorAll('[data-consent]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.consent === 'accept' ? 'granted' : 'denied';
      saveChoice(value);
      apply(value);
      banner.hidden = true;
    });
  });

  document.querySelectorAll('.consent-open').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      banner.hidden = false;
      banner.querySelector('[data-consent]').focus();
    });
  });
}

if (typeof document !== 'undefined') init();
