/**
 * HailandMap — porte d'entrée : écran d'ouverture, connexion de l'agent par code (téléphone ou e-mail),
 * contrôle d'accès, puis l'application.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, Check, Copy, LogOut, Mail, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
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
import { AuthLayout } from './auth/AuthLayout';
import { OtpInput } from './auth/OtpInput';
import { Splash } from './auth/Splash';
import { getUiVersion } from '../shell/uiVersion';

const field =
  'h-12 w-full min-w-0 rounded-[9px] border bg-[#262626] px-3.5 text-base text-hx-text outline-none transition placeholder:text-hx-faint/60 focus:border-hx-accent';
const primary =
  'flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-hx-accent text-[15.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';
const secondary =
  'flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] border border-[#5a5a5a] bg-[#454545] text-[14.5px] font-semibold text-hx-text transition hover:bg-hx-hover';

/** Numéro guinéen : l'indicatif +224 est fixe, l'agent saisit les 9 chiffres (espaces ignorés). Un numéro étranger se saisit avec « + ». */
function toE164(local: string): string {
  const t = local.trim();
  if (t.startsWith('+')) return '+' + t.replace(/\D/g, '');
  return '+224' + t.replace(/\D/g, '').replace(/^224/, '');
}
function formatLocal(raw: string): string {
  if (raw.trim().startsWith('+')) return raw;
  const d = raw.replace(/\D/g, '').slice(0, 9);
  return d.replace(/^(\d{3})(\d{0,2})(\d{0,2})(\d{0,2}).*$/, (_m, a, b, c, e) => [a, b, c, e].filter(Boolean).join(' '));
}

function LoginScreen({ caps }: { caps: AuthCapabilities }) {
  const [channel, setChannel] = useState<'email' | 'phone'>('phone');
  const [step, setStep] = useState<'contact' | 'code'>('contact');
  const [email, setEmail] = useState('');
  const [local, setLocal] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Le téléphone est le choix principal ; l'e-mail seulement si le téléphone n'est pas activé.
  useEffect(() => {
    if (caps.known && !caps.phone && caps.email) setChannel('email');
  }, [caps.known, caps.phone, caps.email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phone = toE164(local);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const phoneOk = /^\+\d{8,15}$/.test(phone) && phone.replace(/\D/g, '').length >= (local.trim().startsWith('+') ? 8 : 12);
  const contact = channel === 'email' ? email.trim() : phone;
  const masked = channel === 'email' ? contact : `+${phone.slice(1, 4)} ${phone.slice(4, 5)}•• •• •• ${phone.slice(-2)}`;

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
      () => (channel === 'email' ? sendEmailCode(email.trim()) : sendPhoneCode(phone)),
      () => {
        setCode('');
        setCooldown(45);
        setStep('code');
      }
    );
  const verify = (c = code) => run(() => (channel === 'email' ? verifyEmailCode(email.trim(), c.trim()) : verifyPhoneCode(phone, c.trim())));
  const noMethod = caps.known && !caps.email && !caps.phone;

  return (
    <AuthLayout showCode>
      {step === 'contact' ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[28px] font-semibold">Espace des agents</h1>
            <p className="m-0 text-[14.5px] leading-relaxed text-hx-dim">
              Connectez-vous pour accéder à l’atelier. Un code à 6 chiffres vous est envoyé, sans mot de passe.
            </p>
          </div>

          {caps.email && caps.phone && (
            <div role="tablist" aria-label="Mode de connexion" className="flex gap-1 rounded-[10px] border border-[#3a3a3a] bg-[#262626] p-1">
              {(['phone', 'email'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={channel === c}
                  onClick={() => {
                    setChannel(c);
                    setError('');
                  }}
                  className={`flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[7px] text-sm transition max-md:h-11 ${channel === c ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:text-hx-text'}`}
                >
                  {c === 'phone' ? <Smartphone size={15} /> : <Mail size={15} />} {c === 'phone' ? 'Téléphone' : 'E-mail'}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && (channel === 'email' ? emailOk : phoneOk)) send();
            }}
          >
            {channel === 'phone' ? (
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold">Numéro de téléphone</span>
                <span className="flex gap-2">
                  <span className="flex h-12 items-center rounded-[9px] border border-hx-line2 bg-hx-panel px-3.5 font-mono text-[15px] text-[#d0d0d0]">+224</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    autoFocus
                    value={local}
                    onChange={(e) => setLocal(formatLocal(e.target.value))}
                    placeholder="6XX XX XX XX"
                    className={`${field} border-hx-line2 font-mono`}
                  />
                </span>
              </label>
            ) : (
              <label className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold">Adresse e-mail</span>
                <input type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@exemple.com" className={`${field} border-hx-line2`} />
              </label>
            )}

            {!caps.known && <p className="m-0 text-[13px] font-semibold text-hx-warn">Réseau indisponible : la connexion est impossible pour le moment.</p>}
            {noMethod && <p className="m-0 text-[13px] font-semibold text-hx-warn">Aucune méthode de connexion n’est activée.</p>}
            {error && (
              <p role="alert" className="m-0 text-sm font-semibold text-hx-warn">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy || noMethod || (channel === 'email' ? !emailOk : !phoneOk)} className={primary}>
              {busy ? 'Envoi…' : <>Recevoir le code <ArrowRight size={17} strokeWidth={2.2} /></>}
            </button>
          </form>

          <div className="flex gap-2.5 rounded-[9px] border border-[#3a3a3a] bg-hx-bar px-3.5 py-3 text-[12.5px] leading-relaxed text-hx-dim">
            <ShieldCheck size={16} className="mt-px shrink-0 text-hx-violet" />
            <span>Accès réservé aux agents autorisés par l’équipe Hailand. Si votre compte n’est pas encore autorisé, vous pourrez nous transmettre votre identifiant à l’étape suivante.</span>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setStep('contact');
              setError('');
            }}
            className="inline-flex items-center gap-1.5 self-start text-[13.5px] text-hx-accent-text transition hover:text-[#b5cdf5]"
          >
            <ArrowLeft size={15} strokeWidth={2.2} /> Modifier {channel === 'email' ? 'l’adresse' : 'le numéro'}
          </button>
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[28px] font-semibold">Entrez le code reçu</h1>
            <p className="m-0 text-[14.5px] leading-relaxed text-hx-dim">
              Code à 6 chiffres envoyé {channel === 'email' ? 'à' : 'au'} <span className="font-mono text-hx-text">{masked}</span>.
            </p>
          </div>
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[13px] font-semibold">Code de vérification</legend>
            <OtpInput value={code} onChange={setCode} onComplete={(c) => verify(c)} disabled={busy} />
          </fieldset>
          {error && (
            <p role="alert" className="m-0 text-sm font-semibold text-hx-warn">
              {error}
            </p>
          )}
          <button type="button" onClick={() => verify()} disabled={busy || code.length < 6} className={primary}>
            {busy ? 'Vérification…' : 'Vérifier et entrer'}
          </button>
          <div className="flex items-center justify-between text-[13px] text-hx-dim">
            <button type="button" onClick={send} disabled={busy || cooldown > 0} className="transition hover:text-hx-text disabled:opacity-60">
              {cooldown > 0 ? (
                <>Renvoyer le code dans <span className="font-mono text-hx-text">0:{String(cooldown).padStart(2, '0')}</span></>
              ) : (
                'Renvoyer le code'
              )}
            </button>
            {caps.email && caps.phone && (
              <button
                type="button"
                onClick={() => {
                  setChannel(channel === 'phone' ? 'email' : 'phone');
                  setStep('contact');
                  setError('');
                }}
                className="text-hx-accent-text transition hover:text-[#b5cdf5]"
              >
                {channel === 'phone' ? 'Utiliser l’e-mail à la place' : 'Utiliser le téléphone'}
              </button>
            )}
          </div>
        </>
      )}
    </AuthLayout>
  );
}

function DeniedScreen({ access, userId, onSignOut }: { access: Extract<AccessState, { state: 'denied' }>; userId: string; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible : l'identifiant reste sélectionnable */
    }
  };
  return (
    <AuthLayout>
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-hx-warn/15">
        <ShieldAlert size={28} className="text-hx-warn" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] font-semibold">{access.reason === 'inactive' ? 'Compte désactivé' : 'Compte non autorisé'}</h1>
        <p className="m-0 text-[14.5px] leading-relaxed text-hx-dim">
          {access.reason === 'inactive'
            ? 'Votre compte agent est désactivé. Contactez l’équipe Hailand pour le réactiver.'
            : 'Votre connexion a réussi, mais ce compte n’est pas encore agent HailandMap. Transmettez cet identifiant à l’équipe Hailand pour obtenir l’accès.'}
        </p>
      </div>
      {access.reason === 'not_listed' && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Votre identifiant</span>
          <div className="flex gap-2">
            <code className="flex h-12 min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap rounded-[9px] border border-hx-line2 bg-[#262626] px-3 font-mono text-[12.5px] text-hx-accent-text">{userId}</code>
            <button type="button" onClick={copy} className="flex h-12 items-center gap-2 rounded-[9px] border border-[#5a5a5a] bg-[#454545] px-4 text-[13.5px] font-semibold transition hover:bg-hx-hover">
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={onSignOut} className={secondary}>
        <LogOut size={16} /> Changer de compte
      </button>
    </AuthLayout>
  );
}

/** Durée minimale de l'écran d'ouverture : assez pour être lu, assez courte pour ne pas gêner. */
const SPLASH_MIN_MS = 1400;

/** Affiche l'ouverture puis la connexion tant qu'aucun agent autorisé n'est connecté ; ensuite l'application. */
export default function AgentGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [caps, setCaps] = useState<AuthCapabilities>({ email: false, phone: false, known: false });
  const [access, setAccess] = useState<AccessState | null>(null);
  const [minDone, setMinDone] = useState(false);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    const p = setInterval(() => setProgress((v) => Math.min(92, v + 9)), 220);
    return () => {
      clearTimeout(t);
      clearInterval(p);
    };
  }, []);

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

  const resolved = ready && (!session?.user || access !== null);
  if (!resolved || !minDone) return <Splash progress={resolved ? 100 : progress} />;
  if (!session?.user) return <LoginScreen caps={caps} />;
  if (!access) return <Splash progress={progress} />;
  if (access.state === 'denied') return <DeniedScreen access={access} userId={session.user.id} onSignOut={logout} />;

  return (
    <>
      {children}
      {getUiVersion() === 'v1' && (
        <div className="pointer-events-none fixed bottom-9 left-3 z-[9999] font-sans">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0A0F1E]/90 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-200 shadow-lg backdrop-blur">
            <span className="max-w-[140px] truncate">{displayNameOf(session.user)}</span>
            {access.transition && <span title="La table des agents n’existe pas encore : tout compte connecté est accepté" className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-300">TRANSITION</span>}
            <button type="button" onClick={logout} aria-label="Se déconnecter" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
