/**
 * HailandMap — authentification des agents (Supabase Auth).
 *
 * Un agent se connecte par code (e-mail aujourd'hui ; SMS dès que le fournisseur est activé). Son identifiant
 * d'authentification devient l'auteur réel des enregistrements (`submitted_by`, `validated_by`, `validator_id`) à la place
 * des valeurs codées en dur (« admin-1 », « Admin », « admin-auto »).
 *
 * Autorisation : table `agents` (proposée dans migrations/proposed/, NON appliquée à ce jour). Tant qu'elle n'existe pas,
 * l'application est en « mode transition » : tout compte authentifié est accepté (le contrôle réel viendra des règles
 * de sécurité de la base, une fois appliquées).
 */
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

import type { AgentRole } from './actor';
export type { AgentRole, AgentActor } from './actor';

export type AccessState =
  | { state: 'allowed'; role: AgentRole; transition: false }
  | { state: 'allowed'; role: AgentRole; transition: true }
  | { state: 'denied'; reason: 'not_listed' | 'inactive' };

export interface AuthCapabilities {
  email: boolean;
  phone: boolean;
  known: boolean;
}

export async function fetchAuthCapabilities(): Promise<AuthCapabilities> {
  try {
    const url: string = (supabase as any).supabaseUrl;
    const key: string = (supabase as any).supabaseKey;
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return { email: false, phone: false, known: false };
    const ext = (await res.json()).external || {};
    return { email: !!ext.email, phone: !!ext.phone, known: true };
  } catch {
    return { email: false, phone: false, known: false };
  }
}

export function authErrorMessage(err: unknown): string {
  const e = err as { message?: string; status?: number } | null;
  const msg = (e?.message || '').toLowerCase();
  if (!navigator.onLine || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Pas de connexion internet. Vérifiez le réseau puis réessayez.';
  }
  if (e?.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'Trop de tentatives. Patientez une minute avant de réessayer.';
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp') || msg.includes('token')) {
    return 'Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.';
  }
  if (msg.includes('signups not allowed')) return 'Les inscriptions sont fermées : demandez un accès au fondateur.';
  if (msg.includes('phone')) return 'Numéro invalide ou connexion par SMS non activée.';
  return 'Une erreur est survenue. Réessayez dans un instant.';
}

export async function getSession(): Promise<Session | null> {
  try {
    return (await supabase.auth.getSession()).data.session;
  } catch {
    return null;
  }
}

export function onAuthChange(cb: (s: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}

export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}
export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}
export async function sendPhoneCode(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) throw error;
}
export async function verifyPhoneCode(phone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function displayNameOf(user: User): string {
  const meta = (user.user_metadata || {}) as { full_name?: string; name?: string };
  return meta.full_name || meta.name || user.phone || (user.email ? user.email.split('@')[0] : '') || 'Agent';
}

/**
 * L'utilisateur connecté est-il un agent autorisé ? Lecture de sa ligne dans `agents`.
 * Table absente (non encore créée) → mode transition ; ligne absente ou inactive → refus.
 */
export async function checkAgentAccess(user: User): Promise<AccessState> {
  try {
    const { data, error } = await supabase.from('agents').select('role, active').eq('id', user.id).maybeSingle();
    if (error) {
      const code = (error as any).code as string | undefined;
      const missingTable = code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(error.message || '');
      if (missingTable) return { state: 'allowed', role: 'agent', transition: true };
      // Autre erreur (réseau, droits) : on ne donne pas l'accès par défaut.
      return { state: 'denied', reason: 'not_listed' };
    }
    if (!data) return { state: 'denied', reason: 'not_listed' };
    if (data.active === false) return { state: 'denied', reason: 'inactive' };
    return { state: 'allowed', role: data.role === 'admin' ? 'admin' : 'agent', transition: false };
  } catch {
    return { state: 'denied', reason: 'not_listed' };
  }
}

export { setActor, getActor, actorId, actorName } from './actor';
