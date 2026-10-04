/**
 * Auteur courant des écritures (agent connecté). Module sans dépendance : importable partout sans cycle.
 * Renseigné par AgentGate après la connexion et le contrôle d'accès.
 */
export type AgentRole = 'agent' | 'admin';

export interface AgentActor {
  id: string;
  name: string;
  role: AgentRole;
}

let currentActor: AgentActor | null = null;

export function setActor(actor: AgentActor | null) {
  currentActor = actor;
}
export function getActor(): AgentActor | null {
  return currentActor;
}
/** Identifiant de l'auteur d'une écriture. Repli « admin-auto » seulement hors session (ne devrait plus arriver). */
export function actorId(): string {
  return currentActor?.id || 'admin-auto';
}
export function actorName(): string {
  return currentActor?.name || 'Agent';
}
