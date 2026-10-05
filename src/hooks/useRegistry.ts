import { useCallback, useEffect, useState } from 'react';
import type { Building, Profile, Validation, Zone } from '../types';
import {
  loadRealBuildings,
  loadRealProfiles,
  loadRealValidations,
  loadRealZones,
  saveValidationInSupabase,
  updateBuildingInSupabase,
} from '../lib/supabase';
import { actorId } from '../lib/actor';
import { linkDeclaration, loadDeclarations, loadOccupancy, type Declaration, type Occupancy } from '../lib/attachment';

export type Notify = (n: { type: 'success' | 'info' | 'warning'; title: string; message: string }) => void;

/**
 * Le registre : fiches, zones, validations et profils lus dans Supabase, et les décisions de la Revue.
 * Aucune donnée de démonstration : si la base est injoignable, `loadError` est renseigné et la liste reste vide.
 */
export function useRegistry(notify: Notify) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Rattachements (§16) : déclarations des résidents (lecture réservée aux agents) et nombre de personnes par bâtiment.
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [occupancy, setOccupancy] = useState<Record<string, Occupancy>>({});
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const syncAttachments = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([loadDeclarations(), loadOccupancy()]);
      setDeclarations(d);
      setOccupancy(o);
      setAttachmentError(null);
    } catch (err: any) {
      setAttachmentError(err?.message || 'Déclarations illisibles.');
    }
  }, []);

  // Chargement du registre depuis Supabase. En cas d'échec, l'agent le voit et peut réessayer (aucune donnée de démonstration).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const syncData = useCallback(async () => {
    setLoading(true);
    try {
      const [realB, realZ, realV, realP] = await Promise.all([
        loadRealBuildings(),
        loadRealZones(),
        loadRealValidations(),
        loadRealProfiles(),
      ]);

      // Assurer l'unicité stricte de chaque ID de bâtiment pour React
      const seenBuildingIds = new Set<string>();
      const sanitizedBuildings = realB.map((b, idx) => {
        let cleanId = b.id;
        if (!cleanId || cleanId === "Tracé Personnalisé" || seenBuildingIds.has(cleanId)) {
          cleanId = `b-${b.hailand_code || 'item'}-${idx}-${Date.now()}`;
        }
        seenBuildingIds.add(cleanId);
        return { ...b, id: cleanId };
      });

      setBuildings(sanitizedBuildings);
      setZones(realZ);
      setValidations(realV);
      setProfiles(realP);
      setLoadError(null);

    } catch (err: any) {
      setLoadError(err?.message || 'Le registre est injoignable.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    syncData();
    syncAttachments();
  }, [syncData, syncAttachments]);

  /** Rattache (ou détache, `buildingId = null`) une déclaration à un bâtiment certifié ; la base refuse tout bâtiment non certifié. */
  const handleLinkDeclaration = async (declarationId: string, buildingId: string | null, unitId: string | null = null) => {
    try {
      await linkDeclaration(declarationId, buildingId, unitId);
      await syncAttachments();
      notify({ type: 'success', title: buildingId ? 'Rattachement officiel' : 'Rattachement retiré', message: buildingId ? 'La personne est rattachée au bâtiment certifié.' : 'La déclaration redevient un simple indice.' });
    } catch (err: any) {
      notify({ type: 'warning', title: 'Rattachement impossible', message: err?.message || 'La base n\u2019a pas répondu : rien n\u2019a été modifié.' });
    }
  };

  const handleApproveBuilding = async (building: Building, newCode: string) => {
    try {
      await updateBuildingInSupabase(building.id, {
        status: 'actif',
        hailand_code: newCode,
        is_validated: true,
        validation_count: (building.validation_count || 0) + 1,
        validated_at: new Date().toISOString()
      });
      
      const newV: Validation = {
        id: 'val-' + Math.random().toString(36).substring(2, 11),
        building_id: building.id,
        validator_id: actorId(),
        type: 'livreur_validation',
        old_geom: null,
        new_geom: null,
        comment: `Génération officielle HailandCode : ${newCode}`,
        status: 'approved',
        reviewed_by: actorId(),
        created_at: new Date().toISOString()
      };
      
      await saveValidationInSupabase({
        building_id: building.id,
        validator_id: actorId(),
        type: 'livreur_validation',
        comment: `Génération officielle HailandCode : ${newCode}`,
        status: 'approved',
        reviewed_by: actorId()
      });
      
      setBuildings(prev => prev.map(b => b.id === building.id ? {
        ...b,
        status: 'actif',
        hailand_code: newCode,
        is_validated: true,
        validation_count: (b.validation_count || 0) + 1,
        validated_at: new Date().toISOString()
      } : b));
      
      setValidations(prev => [newV, ...prev]);
      // Le serveur vient d'attribuer le code public et de rattacher les personnes déjà déclarées dans ce bâtiment.
      await Promise.all([syncData(), syncAttachments()]);
      
    } catch (err: any) {
      notify({ type: 'warning', title: 'Action impossible', message: err?.message || 'La base n\u2019a pas répondu : rien n\u2019a été modifié.' });
    }
  };

  const handleRejectBuilding = async (building: Building, comment: string) => {
    try {
      await updateBuildingInSupabase(building.id, {
        status: 'inactif',
        rejection_reason: comment,
        is_validated: false
      });
      
      const newV: Validation = {
        id: 'val-' + Math.random().toString(36).substring(2, 11),
        building_id: building.id,
        validator_id: actorId(),
        type: 'correct_polygon',
        old_geom: null,
        new_geom: null,
        comment: `Rejet : ${comment}`,
        status: 'rejected',
        reviewed_by: actorId(),
        created_at: new Date().toISOString()
      };
      
      await saveValidationInSupabase({
        building_id: building.id,
        validator_id: actorId(),
        type: 'correct_polygon',
        comment: `Rejet : ${comment}`,
        status: 'rejected',
        reviewed_by: actorId()
      });
      
      setBuildings(prev => prev.map(b => b.id === building.id ? {
        ...b,
        status: 'inactif',
        rejection_reason: comment,
        is_validated: false
      } : b));
      
      setValidations(prev => [newV, ...prev]);
      
    } catch (err: any) {
      notify({ type: 'warning', title: 'Action impossible', message: err?.message || 'La base n\u2019a pas répondu : rien n\u2019a été modifié.' });
    }
  };

  // Demande de visite terrain : note enregistrée sur la fiche (colonne modification_request), statut inchangé.
  const handleRequestVisit = async (building: Building, note: string) => {
    try {
      await updateBuildingInSupabase(building.id, { modification_request: note });
      setBuildings((prev) => prev.map((b) => (b.id === building.id ? { ...b, modification_request: note } : b)));
      notify({ type: 'info', title: 'Visite demandée', message: `${building.hailand_code ?? 'Fiche'} : ${note}` });
    } catch (err: any) {
      notify({ type: 'warning', title: 'Action impossible', message: err?.message || 'La base n\u2019a pas répondu : rien n\u2019a été modifié.' });
    }
  };


  return { buildings, setBuildings, zones, setZones, validations, setValidations, profiles, setProfiles, loadError, loading, syncData, handleApproveBuilding, handleRejectBuilding, handleRequestVisit, declarations, occupancy, attachmentError, syncAttachments, handleLinkDeclaration };
}
