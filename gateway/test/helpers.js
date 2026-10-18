// Test harness: the app with an undici MockAgent (no network), an
// in-memory database, a fake DNS lookup, a fake resolver and a mail
// transport that collects messages.
import { MockAgent } from 'undici';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

export const PUBLIC_IP = '93.184.216.34';

export function testEnv(extra = {}) {
  return { DATABASE_PATH: ':memory:', RATE_LIMIT_SCALE: '0', PUBLIC_URL: 'https://api.test', SITE_URL: 'https://site.test/', WAITLIST_CONFIRM_EMAIL: 'true', ...extra };
}

export const publicLookup = async () => [{ address: PUBLIC_IP, family: 4 }];
export const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];

export function fakeResolver({ naptr = {}, cname = {} } = {}) {
  const fail = (code) => Object.assign(new Error(code), { code });
  return {
    async resolveNaptr(name) {
      if (naptr[name] instanceof Error) throw naptr[name];
      if (!naptr[name]) throw fail('ENOTFOUND');
      return naptr[name];
    },
    async resolveCname(name) {
      if (cname[name] instanceof Error) throw cname[name];
      if (!cname[name]) throw fail('ENOTFOUND');
      return cname[name];
    }
  };
}

export async function createTestApp({ env = {}, resolver, lookup = publicLookup, logger = false, transport, failMail = false } = {}) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const sent = [];
  let mailTransport = transport;
  if (transport === undefined) {
    mailTransport = {
      async sendMail(message) {
        if (failMail) throw new Error('smtp down');
        sent.push(message);
        return { messageId: `${sent.length}` };
      }
    };
  }
  const app = await buildApp(loadConfig(testEnv(env)), { logger, dispatcher: agent, lookup, resolver, transport: mailTransport });
  return { app, agent, sent, pool: (origin) => agent.get(origin) };
}

export const json = { headers: { 'content-type': 'application/json' } };

export function captureLogs() {
  const lines = [];
  return { lines, stream: { write: (line) => lines.push(line) }, text: () => lines.join('\n') };
}
