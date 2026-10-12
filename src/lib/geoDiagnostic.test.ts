import { describe, expect, it } from 'vitest';
import { describeGeoError, isInAppBrowser } from './geoDiagnostic';

const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const WEBVIEW_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const FACEBOOK_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';

describe('isInAppBrowser', () => {
  it('Safari, Chrome iPhone et Chrome Android ne sont pas des navigateurs intégrés', () => {
    expect(isInAppBrowser(SAFARI_IOS, false)).toBe(false);
    expect(isInAppBrowser(CHROME_IOS, false)).toBe(false);
    expect(isInAppBrowser(CHROME_ANDROID, false)).toBe(false);
  });
  it('une vue web iPhone sans « Safari/ » (WhatsApp, etc.) est un navigateur intégré', () => {
    expect(isInAppBrowser(WEBVIEW_IOS, false)).toBe(true);
    expect(isInAppBrowser(FACEBOOK_IOS, false)).toBe(true);
  });
  it('une vue web Android (« ; wv) ») est un navigateur intégré', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0 Mobile Safari/537.36', false)).toBe(true);
  });
  it('une application installée sur l’écran d’accueil (standalone) n’est pas signalée', () => {
    expect(isInAppBrowser(WEBVIEW_IOS, true)).toBe(false);
  });
});

describe('describeGeoError', () => {
  it('refus sur iPhone : explique les réglages Safari et la position précise', () => {
    const h = describeGeoError(1, SAFARI_IOS, false);
    expect(h.problem).toBe('refuse');
    expect(h.steps.join(' ')).toMatch(/Service de localisation/);
    expect(h.steps.join(' ')).toMatch(/Position précise/);
    expect(h.inAppBrowser).toBe(false);
  });
  it('refus dans le navigateur d’une application : demande d’abord d’ouvrir dans Safari', () => {
    const h = describeGeoError(1, FACEBOOK_IOS, false);
    expect(h.inAppBrowser).toBe(true);
    expect(h.steps[0]).toMatch(/Safari/);
  });
  it('signal absent et délai dépassé ont leurs propres consignes', () => {
    expect(describeGeoError(2, SAFARI_IOS, false).problem).toBe('signal');
    expect(describeGeoError(3, SAFARI_IOS, false).problem).toBe('delai');
  });
  it('Android : consignes sans réglages iPhone', () => {
    const h = describeGeoError(1, CHROME_ANDROID, false);
    expect(h.steps.join(' ')).not.toMatch(/Safari/);
  });
});
