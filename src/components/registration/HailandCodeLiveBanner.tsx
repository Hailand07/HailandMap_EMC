import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, CheckCircle2, Building2, MapPin } from 'lucide-react';

interface HailandCodeLiveBannerProps {
  code: string;
  zone: string;
  courtyard?: string | null;
  buildingPart?: string | null;
  floorPart?: string | null;
  unitPart?: string | null;
  isComplete?: boolean;
  phase?: 'building' | 'location'; // Phase 1: Structure Bâtiment | Phase 2: Emplacement Spécifique
  adminAddressCode?: string | null;
  formattedAddress?: string | null;
  communeNom?: string | null;
  quartierNom?: string | null;
}

export default function HailandCodeLiveBanner({
  code,
  zone,
  courtyard,
  buildingPart,
  floorPart,
  unitPart,
  isComplete = false,
  phase = 'building',
  adminAddressCode,
  formattedAddress,
  communeNom,
  quartierNom,
}: HailandCodeLiveBannerProps) {
  const isPhase1 = phase === 'building';

  return (
    <div className="w-full bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-orange-500/30 rounded-2xl p-3.5 shadow-xl ring-1 ring-orange-500/15 overflow-hidden relative space-y-2.5">
      {/* Halo subtil */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isPhase1 ? (
            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/30">
              <Building2 className="w-3 h-3 text-amber-400" />
              DOUBLE ADRESSAGE NATIONAL
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
              <MapPin className="w-3 h-3 text-emerald-400" />
              DOUBLE ADRESSAGE FINAL UNITÉ
            </span>
          )}
        </div>

        {isComplete ? (
          <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {isPhase1 ? 'CONCESSION VALIDÉE' : 'ADRESSE VALIDÉE'}
          </span>
        ) : (
          <span className="text-[9px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
            Calcul spatial en direct...
          </span>
        )}
      </div>

      {/* SYSTÈME 1 : ADRESSAGE MATRICIEL PAR GRILLES (200m) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1 text-orange-400 font-semibold">
            <span>① SYSTÈME GRILLE (200m) :</span>
          </span>
          <span className="text-[9px] text-slate-500">Navigation métrique GPS</span>
        </div>
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-center gap-1 flex-wrap font-mono text-xs sm:text-sm font-bold shadow-inner">
          {/* PAYS */}
          <span className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            GN
          </span>
          <span className="text-slate-600">-</span>

          {/* ZONE */}
          <span className="text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20" title="Zone 200m (PostGIS)">
            {zone || 'Z00142'}
          </span>

          {/* COUR (si présente) */}
          {courtyard && (
            <>
              <span className="text-slate-600">-</span>
              <span className="text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20" title="Identifiant Cour / Concession">
                {courtyard}
              </span>
            </>
          )}

          {/* BÂTIMENT */}
          {buildingPart ? (
            <>
              <span className="text-slate-600">-</span>
              <span className="text-orange-400 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-500/30" title="Identifiant Bâtiment Physique">
                {buildingPart}
              </span>
            </>
          ) : (
            <>
              <span className="text-slate-600">-</span>
              <span className="text-slate-600 italic text-xs bg-slate-900/50 px-1.5 py-0.5 rounded border border-dashed border-slate-700">
                [Bâtiment]
              </span>
            </>
          )}

          {/* ÉTAGE */}
          {!isPhase1 && floorPart && (
            <>
              <span className="text-slate-600">-</span>
              <span className="text-indigo-400 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/20" title="Niveau / Étage de l'unité">
                {floorPart}
              </span>
            </>
          )}

          {/* UNITÉ */}
          {!isPhase1 && unitPart && (
            <>
              <span className="text-slate-600">-</span>
              <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20" title="Sous-code Unité (Porte / Lot / Appartement)">
                {unitPart}
              </span>
            </>
          )}
        </div>
      </div>

      {/* SYSTÈME 2 : ADRESSAGE HIÉRARCHIQUE ADMINISTRATIF */}
      {adminAddressCode && (
        <div className="space-y-1 pt-1 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span>② SYSTÈME ADMINISTRATIF :</span>
            </span>
            <span className="text-[9px] text-slate-500">Cadastre d'État & Citoyenneté</span>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2 flex items-center justify-between gap-2 font-mono text-xs font-bold text-emerald-300">
            <span className="tracking-wider">{adminAddressCode}</span>
            {(communeNom || quartierNom) && (
              <span className="text-[10px] font-normal text-emerald-400/80 hidden sm:inline">
                {quartierNom ? `${quartierNom} · ` : ''}{communeNom}
              </span>
            )}
          </div>
          {formattedAddress && (
            <p className="text-[10px] text-slate-400 italic px-1 font-sans">
              📍 {formattedAddress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
