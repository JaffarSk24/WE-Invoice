// Build-time configuration: app version, web or desktop build, gateway URL.
// The values come from app/vite.config.js (define).
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const IS_WEB_BUILD = typeof __WEB_BUILD__ !== 'undefined' ? __WEB_BUILD__ : true;
export const GATEWAY_URL = typeof __GATEWAY_URL__ !== 'undefined' ? __GATEWAY_URL__ : 'https://invoice-api.whiteeagles.sk';
// Google OAuth client of the web app (a public identifier, not a secret);
// set with the GOOGLE_CLIENT_ID environment variable at build time.
export const GOOGLE_CLIENT_ID = typeof __GOOGLE_CLIENT_ID__ !== 'undefined' ? __GOOGLE_CLIENT_ID__ : '';
