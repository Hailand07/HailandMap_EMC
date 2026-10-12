import React, { useState } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { isInAppBrowser, isIOS } from '../lib/geoDiagnostic';

const DISMISS_KEY = 'hx.inAppNoticeDismissed';
const readDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/** Prévient quand le lien est ouvert dans le navigateur d'une application (WhatsApp, Facebook…) : la localisation n'y fonctionne pas. */
export const InAppBrowserNotice: React.FC = () => {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copied, setCopied] = useState(false);
  if (dismissed || !isInAppBrowser()) return null;
  const ios = isIOS();
  const browser = ios ? 'Safari' : 'Chrome';
  return (
    <div role="alert" aria-label="Ouvrir dans le navigateur" className="fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[200] rounded-2xl border border-hx-line2 bg-hx-panel p-4 font-sans text-hx-text shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
      <div className="flex items-start gap-3">
        <ExternalLink size={20} className="mt-0.5 shrink-0 text-hx-warn" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight">La localisation ne marche pas ici</div>
          <p className="mt-1 text-[13px] leading-snug text-hx-dim">
            Ce lien est ouvert dans une application (WhatsApp, Facebook…). Ouvrez-le dans {browser} : {ios ? 'touchez « ⋯ » ou l’icône boussole, puis « Ouvrir dans Safari »' : 'menu « ⋮ », puis « Ouvrir dans le navigateur »'}.
          </p>
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => {
            try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* sans effet */ }
            setDismissed(true);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hx-hover"
        >
          <X size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={async () => {
          try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { /* indisponible */ }
        }}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-hx-accent text-[14px] font-semibold text-white"
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}
        {copied ? `Lien copié : collez-le dans ${browser}` : 'Copier le lien'}
      </button>
    </div>
  );
};
