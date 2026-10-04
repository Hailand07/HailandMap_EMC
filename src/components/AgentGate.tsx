/**
 * HailandMap — porte d'entrée : connexion de l'agent par code, contrôle d'accès, puis l'application.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, Mail, ShieldAlert, Smartphone } from 'lucide-react';
import {
  authErrorMessage,
  checkAgentAccess,
  displayNameOf,
  fetchAuthCapabilities,
  getSession,
  onAuthChange,
  sendEmailCode,
  sendPhoneCode,
  setActor,
  signOut,
  verifyEmailCode,
  verifyPhoneCode,
  type AccessState,
  type AuthCapabilities,
} from '../lib/agentAuth';

const shell = 'min-h-screen w-screen bg-[#0A0F1E] text-slate-100 flex items-center justify-center p-6 font-sans';
const card = 'w-full max-w-sm rounded-3xl border border-white/10 bg-[#1A2540]/80 p-7 shadow-2xl backdrop-blur';
const input =
  'mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-[#0A0F1E] px-4 text-base font-semibold text-slate-100 placeholder:text-slate-500 focus:border-[#00FFB2] focus:outline-none';
const primary =
  'h-12 w-full rounded-xl bg-[#00FFB2] text-[15px] font-extrabold text-[#0A0F1E] transition active:opacity-80 disabled:opacity-40';

function LoginScreen({ caps }: { caps: AuthCapabilities }) {
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [step, setStep] = useState<'contact' | 'code'>('contact');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+224');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const cleanPhone = phone.replace(/\s/g, '');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const phoneOk = /^\+\d{8,15}$/.test(cleanPhone);

  const run = async (fn: () => Promise<void>, next?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      next?.();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(
      () => (channel === 'email' ? sendEmailCode(email.trim()) : sendPhoneCode(cleanPhone)),
      () => {
        setCode('');
        setCooldown(45);
        setStep('code');
      }
    );
  const verify = () => run(() => (channel === 'email' ? verifyEmailCode(email.trim(), code.trim()) : verifyPhoneCode(cleanPhone, code.trim())));

  return (
    <div className={shell}>
      <div className={card}>
        <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#00FFB2]">HAILANDMAP · ATELIER</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Connexion des agents</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Chaque enregistrement est signé par son auteur. Connectez-vous avec le compte que le fondateur a autorisé.
        </p>

        {step === 'contact' ? (
          <>
            {caps.email && caps.phone && (
              <div className="mt-5 flex rounded-xl bg-[#0A0F1E] p-1" role="tablist">
                {(['email', 'phone'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={channel === c}
                    onClick={() => setChannel(c)}
                    className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-bold ${channel === c ? 'bg-[#1E293B] text-white' : 'text-slate-400'}`}
                  >
                    {c === 'email' ? <Mail size={16} /> : <Smartphone size={16} />} {c === 'email' ? 'E-mail' : 'Téléphone'}
                  </button>
                ))}
              </div>
            )}
            <label className="mt-5 block">
              <span className="text-[11px] font-extrabold tracking-[0.12em] text-slate-400">{channel === 'email' ? 'E-MAIL' : 'TÉLÉPHONE'}</span>
              {channel === 'email' ? (
                <input type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@exemple.com" className={input} />
              ) : (
                <input type="tel" inputMode="tel" autoComplete="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+224 6XX XX XX XX" className={input} />
              )}
            </label>
            {!caps.known && <p className="mt-3 text-xs font-semibold text-amber-300">Réseau indisponible : la connexion est impossible pour le moment.</p>}
            {error && <p role="alert" className="mt-3 text-sm font-bold text-amber-300">{error}</p>}
            <button type="button" onClick={send} disabled={busy || (channel === 'email' ? !emailOk : !phoneOk) || (!caps.email && !caps.phone)} className={`${primary} mt-6`}>
              {busy ? 'Envoi…' : 'Recevoir le code'}
            </button>
          </>
        ) : (
          <>
            <p className="mt-5 text-sm text-slate-300">
              Code envoyé à <b className="text-white">{channel === 'email' ? email.trim() : cleanPhone}</b>.
              {channel === 'email' && ' Vous pouvez aussi ouvrir le lien du message.'}
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={8}
              aria-label="Code de connexion"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
              className={`${input} text-center text-2xl tracking-[0.4em]`}
            />
            {error && <p role="alert" className="mt-3 text-sm font-bold text-amber-300">{error}</p>}
            <button type="button" onClick={verify} disabled={busy || code.length < 6} className={`${primary} mt-5`}>
              {busy ? 'Vérification…' : 'Se connecter'}
            </button>
            <div className="mt-3 flex justify-between text-sm font-bold text-slate-400">
              <button type="button" onClick={() => setStep('contact')}>Changer de contact</button>
              <button type="button" onClick={send} disabled={busy || cooldown > 0} className="disabled:opacity-50">
                {cooldown > 0 ? `Renvoyer (${cooldown} s)` : 'Renvoyer le code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeniedScreen({ access, userId, onSignOut }: { access: Extract<AccessState, { state: 'denied' }>; userId: string; onSignOut: () => void }) {
  return (
    <div className={shell}>
      <div className={card}>
        <ShieldAlert className="text-amber-300" size={34} />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Accès non autorisé</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {access.reason === 'inactive'
            ? 'Votre compte agent est désactivé. Contactez le fondateur.'
            : 'Votre compte n’est pas encore autorisé comme agent. Transmettez cet identifiant au fondateur pour obtenir l’accès :'}
        </p>
        {access.reason === 'not_listed' && (
          <code className="mt-3 block break-all rounded-lg bg-[#0A0F1E] p-3 text-xs text-[#00FFB2]">{userId}</code>
        )}
        <button type="button" onClick={onSignOut} className={`${primary} mt-6 flex items-center justify-center gap-2 !bg-white/10 !text-white`}>
          <LogOut size={16} /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

/** Affiche la connexion tant qu'aucun agent autorisé n'est connecté ; ensuite l'application et un petit rappel d'identité. */
export default function AgentGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [caps, setCaps] = useState<AuthCapabilities>({ email: false, phone: false, known: false });
  const [access, setAccess] = useState<AccessState | null>(null);

  useEffect(() => {
    let alive = true;
    getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
    });
    fetchAuthCapabilities().then((c) => alive && setCaps(c));
    const off = onAuthChange((s) => {
      setSession(s);
      setReady(true);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    setAccess(null);
    const user = session?.user;
    if (!user) {
      setActor(null);
      return;
    }
    let alive = true;
    checkAgentAccess(user).then((a) => {
      if (!alive) return;
      setAccess(a);
      if (a.state === 'allowed') setActor({ id: user.id, name: displayNameOf(user), role: a.role });
      else setActor(null);
    });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  if (!ready) return <div className={shell} role="status">Chargement…</div>;
  if (!session?.user) return <LoginScreen caps={caps} />;
  if (!access) return <div className={shell} role="status">Vérification de l’accès…</div>;
  if (access.state === 'denied') return <DeniedScreen access={access} userId={session.user.id} onSignOut={logout} />;

  return (
    <>
      {children}
      <div className="pointer-events-none fixed bottom-9 left-3 z-[9999] font-sans">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0A0F1E]/90 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-200 shadow-lg backdrop-blur">
          <span className="max-w-[140px] truncate">{displayNameOf(session.user)}</span>
          {access.transition && <span title="La table des agents n’existe pas encore : tout compte connecté est accepté" className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-300">TRANSITION</span>}
          <button type="button" onClick={logout} aria-label="Se déconnecter" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </>
  );
}
