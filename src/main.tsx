import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AgentGate from './components/AgentGate.tsx';
import './index.css';

// Protection globale contre les erreurs de sérialisation circulaire et erreurs de chargement de modèles 3D
if (typeof window !== 'undefined') {
  const isCircularMsg = (m: any) => {
    const s = String(m || '').toLowerCase();
    return (
      s.includes('circular structure') ||
      s.includes('converting circular') ||
      s.includes('closes the circle') ||
      s.includes('could not load model') ||
      s.includes('house-model') ||
      s.includes('house.glb') ||
      s.includes("source 'composite'") ||
      s.includes("does not exist in the map's style")
    );
  };

  // 1. Monkeypatch global JSON.stringify pour neutraliser TOUTE sérialisation circulaire (Mapbox Map, IControl, DOM)
  const originalJSONStringify = JSON.stringify;
  JSON.stringify = function (value: any, replacer?: any, space?: any): string {
    try {
      return originalJSONStringify.call(this, value, replacer, space);
    } catch (err: any) {
      if (err && isCircularMsg(err.message || err)) {
        try {
          const seen = new WeakSet();
          return originalJSONStringify.call(
            this,
            value,
            function (key: string, val: any) {
              if (typeof replacer === 'function') {
                val = replacer.call(this, key, val);
              }
              if (val !== null && typeof val === 'object') {
                if (
                  (typeof Node !== 'undefined' && val instanceof Node) ||
                  (typeof Window !== 'undefined' && val instanceof Window) ||
                  (val.constructor && val.constructor.name === 'Map') ||
                  typeof val.getCanvas === 'function' ||
                  typeof val.getContainer === 'function' ||
                  val._controls !== undefined ||
                  val._map !== undefined ||
                  key === '_map' ||
                  key === '_controls' ||
                  key === 'map' ||
                  key === 'mapInstance' ||
                  key === 'mapRef'
                ) {
                  return undefined;
                }
                if (seen.has(val)) {
                  return undefined;
                }
                seen.add(val);
              }
              return val;
            },
            space
          );
        } catch {
          return '{}';
        }
      }
      throw err;
    }
  };

  // 2. Assainir les arguments de console pour éviter que les proxies de logging n'échouent
  const sanitizeConsoleArg = (arg: any, seen = new WeakSet()): any => {
    if (arg === null || arg === undefined) return arg;
    if (typeof arg !== 'object') return arg;
    if (typeof Node !== 'undefined' && arg instanceof Node) return '[DOM Node]';
    if (typeof Window !== 'undefined' && arg instanceof Window) return '[Window]';
    if (
      (arg.constructor && arg.constructor.name === 'Map') ||
      typeof arg.getCanvas === 'function' ||
      typeof arg.getContainer === 'function' ||
      arg._controls !== undefined ||
      arg._map !== undefined
    ) {
      return '[Mapbox Map Instance]';
    }
    if (arg instanceof Error) {
      return arg.message || String(arg);
    }
    if (seen.has(arg)) {
      return '[Circular]';
    }
    seen.add(arg);
    if (Array.isArray(arg)) {
      return arg.slice(0, 50).map(item => sanitizeConsoleArg(item, seen));
    }
    const clean: Record<string, any> = {};
    for (const key of Object.keys(arg).slice(0, 50)) {
      if (key === '_map' || key === '_controls' || (key === 'target' && arg[key]?._controls)) {
        clean[key] = '[Mapbox Ref]';
        continue;
      }
      try {
        clean[key] = sanitizeConsoleArg(arg[key], seen);
      } catch {
        clean[key] = '[Unserializable]';
      }
    }
    return clean;
  };

  const wrapConsoleMethod = (originalMethod: (...args: any[]) => void) => {
    return function (...args: any[]) {
      try {
        const sanitizedArgs = args.map(a => sanitizeConsoleArg(a));
        originalMethod.apply(console, sanitizedArgs);
      } catch {
        // En cas de problème exceptionnel, repli sur chaîne simple
        try {
          originalMethod.apply(console, args.map(a => (typeof a === 'object' ? String(a) : a)));
        } catch {
          // No-op
        }
      }
    };
  };

  console.log = wrapConsoleMethod(console.log);
  console.warn = wrapConsoleMethod(console.warn);
  const wrappedError = wrapConsoleMethod(console.error);
  console.error = function (...args: any[]) {
    try {
      const firstArg = args[0];
      const str = String((firstArg && (firstArg.message || firstArg.stack || firstArg)) || '');
      if (isCircularMsg(str)) {
        console.warn(...args);
        return;
      }
    } catch {}
    wrappedError(...args);
  };
  console.info = wrapConsoleMethod(console.info);

  // 3. Captures globales d'exceptions résiduelles
  const origOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (isCircularMsg(String(message)) || (error && isCircularMsg(error.message))) {
      return true; // Intercepter et empêcher le crash de l'applet
    }
    if (origOnError) return origOnError.apply(window, arguments as any);
    return false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason?.message || event.reason || '');
    if (isCircularMsg(msg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('error', (event) => {
    const msg = String(event.message || event.error?.message || '');
    if (isCircularMsg(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentGate>
      <App />
    </AgentGate>
  </StrictMode>,
);

