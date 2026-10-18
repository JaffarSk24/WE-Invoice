// Build-time configuration: app version, web or desktop build, gateway URL.
// The values come from app/vite.config.js (define).
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const IS_WEB_BUILD = typeof __WEB_BUILD__ !== 'undefined' ? __WEB_BUILD__ : true;
export const GATEWAY_URL = typeof __GATEWAY_URL__ !== 'undefined' ? __GATEWAY_URL__ : 'https://invoice-api.whiteeagles.sk';
