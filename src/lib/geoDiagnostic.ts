/**
 * Diagnostic de la géolocalisation : pourquoi la position n'arrive pas, et quoi faire (surtout sur iPhone).
 * Causes fréquentes sur iPhone : navigateur intégré à une application (WhatsApp, Facebook, Instagram… : la localisation y est bloquée ou muette),
 * réglage « Position » du site refusé dans Safari, « Services de localisation » coupés, délai trop court en intérieur.
 */

export type GeoProblem = 'refuse' | 'signal' | 'delai' | 'indisponible';

export interface GeoHelp {
  problem: GeoProblem;
  title: string;
  message: string;
  /** Gestes à faire, dans l'ordre. */
  steps: string[];
  /** Navigateur intégré à une application : la solution est d'ouvrir le lien dans Safari / Chrome. */
  inAppBrowser: boolean;
}

export const isIOS = (ua: string = navigator.userAgent, platform: string = navigator.platform, touchPoints: number = navigator.maxTouchPoints): boolean =>
  /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);

/**
 * Navigateur intégré à une application (WhatsApp, Facebook, Instagram, TikTok…). Sur iPhone, une vue web intégrée n'envoie pas le jeton
 * « Safari/ » et n'est pas une application installée sur l'écran d'accueil.
 */
export function isInAppBrowser(ua: string = navigator.userAgent, standalone: boolean = !!(navigator as unknown as { standalone?: boolean }).standalone): boolean {
  if (/FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|Snapchat|TikTok|musical_ly|LinkedInApp|Twitter|WhatsApp|GSA\/|Line\//i.test(ua)) return true;
  if (/iPhone|iPad|iPod/.test(ua) && !standalone && !/Safari\//.test(ua)) return true;
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true; // vue web Android (WhatsApp, etc.)
  return false;
}

export function describeGeoError(code: number, ua: string = navigator.userAgent, standalone?: boolean): GeoHelp {
  const inApp = isInAppBrowser(ua, standalone);
  const ios = isIOS(ua, /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : '', /iPhone|iPad|iPod/.test(ua) ? 5 : 0);
  const openElsewhere = inApp ? [ios ? 'Ouvrez ce lien dans Safari (menu « ⋯ » ou l’icône boussole, puis « Ouvrir dans Safari »).' : 'Ouvrez ce lien dans Chrome (menu « ⋮ », puis « Ouvrir dans le navigateur »).'] : [];

  if (code === 1) {
    return {
      problem: 'refuse',
      inAppBrowser: inApp,
      title: 'La localisation est refusée',
      message: inApp ? 'Cette page est ouverte dans une application (WhatsApp, Facebook…), qui bloque la localisation.' : 'Le navigateur n’a pas l’autorisation de lire votre position.',
      steps: [
        ...openElsewhere,
        ...(ios
          ? [
              'Réglages > Confidentialité et sécurité > Service de localisation : activé.',
              'Dans la même liste, « Safari – Sites web » : choisissez « Lors de l’utilisation de l’app » et activez « Position précise ».',
              'Dans Safari, touchez « aA » à gauche de l’adresse > « Réglages du site web » > Position > « Autoriser ».',
            ]
          : ['Dans les réglages du site (cadenas à côté de l’adresse), autorisez « Position ».', 'Vérifiez que la localisation de l’appareil est activée.']),
        'Revenez ici et touchez « Réessayer ».',
      ],
    };
  }
  if (code === 2) {
    return {
      problem: 'signal',
      inAppBrowser: inApp,
      title: 'Aucun signal de position',
      message: 'L’appareil ne trouve pas votre position pour le moment.',
      steps: [
        ...openElsewhere,
        'Vérifiez que « Service de localisation » est activé dans les réglages du téléphone.',
        'Activez le Wi-Fi (il aide à se situer), puis rapprochez-vous d’une fenêtre ou sortez un instant.',
        'Touchez « Réessayer ».',
      ],
    };
  }
  return {
    problem: 'delai',
    inAppBrowser: inApp,
    title: 'La position met trop de temps',
    message: 'Le signal est faible à l’intérieur. Nous réessayons avec une précision moindre.',
    steps: [...openElsewhere, 'Rapprochez-vous d’une fenêtre ou sortez un instant, puis touchez « Réessayer ».'],
  };
}

/** Options à essayer dans l'ordre : précision maximale (délai large), puis précision réduite (réseau, Wi-Fi), position récente acceptée. */
export const GEO_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 },
];

/** Position en une fois, avec repli automatique en précision réduite si la haute précision n'arrive pas. Rejette avec l'erreur du dernier essai. */
export function getPositionWithFallback(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 2, message: 'Géolocalisation indisponible' });
      return;
    }
    const attempt = (i: number) =>
      navigator.geolocation.getCurrentPosition(resolve, (err) => {
        // Un refus ne se règle pas par un nouvel essai ; le reste (délai, signal) oui.
        if (err.code === 1 || i >= GEO_ATTEMPTS.length - 1) reject(err);
        else attempt(i + 1);
      }, GEO_ATTEMPTS[i]);
    attempt(0);
  });
}

/**
 * Position reçue mais imprécise (au-delà de 30 m) : le plus souvent le GPS du téléphone n'est pas utilisé
 * (« Position précise » coupée pour le navigateur) ou l'appareil n'en a pas (ordinateur). Gestes à faire, selon l'appareil.
 */
export function describeImprecise(accuracyM: number, ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints): GeoHelp {
  const ios = isIOS(ua, /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : '', touchPoints);
  const android = /Android/i.test(ua);
  const inApp = isInAppBrowser(ua);
  const km = accuracyM >= 1000 ? `${(accuracyM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : `${Math.round(accuracyM)} m`;
  if (!ios && !android && touchPoints === 0) {
    return {
      problem: 'signal', inAppBrowser: false,
      title: 'Position imprécise sur ordinateur',
      message: 'Un ordinateur n’a pas de GPS : sa position vient des réseaux Wi-Fi voisins ou de l’adresse Internet, et peut être fausse de plusieurs kilomètres (même dans la mer).',
      steps: ['Sur le terrain, utilisez HailandMap sur un téléphone, GPS activé. Au bureau, cherchez le quartier ou collez des coordonnées dans la recherche.'],
    };
  }
  return {
    problem: 'signal', inAppBrowser: inApp,
    title: `Position imprécise (± ${km})`,
    message: accuracyM > 150 ? 'Le téléphone ne donne pas sa position GPS au navigateur : elle vient du réseau et peut être loin de vous.' : 'Le signal GPS est faible ici.',
    steps: [
      ...(inApp ? ['Ouvrez HailandMap dans Chrome ou Safari, pas dans WhatsApp ou Facebook.'] : []),
      ...(ios
        ? ['Réglages > Confidentialité et sécurité > Service de localisation > Safari (ou Chrome) : « Lors de l’utilisation » et « Position exacte » activée.']
        : android
          ? ['Paramètres > Localisation : activée, et « Précision de la localisation Google » activée.', 'Chrome : cadenas à gauche de l’adresse > Autorisations > Position > Autoriser, avec « Utiliser la position exacte ».']
          : []),
      'Sortez à découvert quelques secondes : le point se précise tout seul.',
    ],
  };
}

/** Ordinateur (ni téléphone ni tablette) : pas de puce GPS ; sa position vient du Wi-Fi ou d'Internet, même quand le navigateur l'annonce précise. */
export const isDesktopDevice = (ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints): boolean =>
  !/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && touchPoints === 0;
