import { describe, expect, it } from 'vitest';
import { sensitiveReason } from '../src/shared/sensitive';

describe('sensitiveReason', () => {
  it.each([
    'https://mail.google.com/mail/u/0/',
    'https://www.rbcroyalbank.com/fr/',
    'https://secure.td.com/login',
    'https://accesd.desjardins.com/',
    'https://www.paypal.com/myaccount',
    'https://vault.bitwarden.com/',
    'https://mybank.example.com/',
    'https://www.banque-exemple.fr/',
    'http://192.168.1.1/',
    'http://10.0.0.5:8080/',
    'http://172.20.3.4/',
    'https://wiki.corp/',
    'http://printer.local/',
    'chrome://settings',
  ])('bloque %s', (url) => expect(sensitiveReason(url)).not.toBeNull());

  it.each([
    'https://en.wikipedia.org/wiki/Golden_ratio',
    'https://www.youtube.com/watch?v=x',
    'https://news.ycombinator.com/',
    'http://127.0.0.1:5173/',
    'https://www.healthline-style-blog.example/', // « health » seulement comme mot isolé
    'https://github.com/',
  ])('autorise %s', (url) => expect(sensitiveReason(url)).toBeNull());
});
