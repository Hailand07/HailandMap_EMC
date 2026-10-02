import React from 'react';
import { motion } from 'motion/react';
import { Home, Building2, ArrowRight, Layers, ShieldCheck, MapPin, Sparkles } from 'lucide-react';

interface StructureChoiceStepProps {
  onSelectOption: (option: 'courtyard' | 'direct') => void;
  detectedZone: string;
  detectedCommune: string;
  onCancel: () => void;
}

export default function StructureChoiceStep({
  onSelectOption,
  detectedZone,
  detectedCommune,
  onCancel
}: StructureChoiceStepProps) {
  return (
    <div className="space-y-4">
      {/* En-tête Étape 0 */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold font-mono">
            0
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-orange-400 font-bold block">
              Moteur d'enregistrement v3.0
            </span>
            <h3 className="text-sm font-bold text-white font-display">
              Choix initial de la structure
            </h3>
          </div>
        </div>
        
        {/* Localisation détectée */}
        <div className="text-right">
          <span className="text-[9px] font-mono text-slate-400 uppercase block">Zone PostGIS</span>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
            {detectedZone}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed font-sans px-1">
        Sélectionnez la typologie de l'espace sélectionné sur la carte pour adapter automatiquement la séquence d'adressage et le calcul de code :
      </p>

      {/* Cartes d'Options A & B */}
      <div className="grid grid-cols-1 gap-3">
        {/* OPTION A : COUR / CONCESSION */}
        <motion.button
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectOption('courtyard')}
          className="w-full text-left p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-850 hover:from-slate-850 hover:to-slate-800 border-2 border-slate-700/80 hover:border-amber-500/80 transition-all shadow-xl group cursor-pointer relative overflow-hidden ring-1 ring-white/5"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-amber-500/10 transition-all" />
          
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 group-hover:bg-amber-500/25 transition-all">
              <Home className="w-6 h-6" />
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wide bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                  Option A
                </span>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-amber-300 flex items-center gap-1">
                  Parcours Cour <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

              <h4 className="text-sm font-bold text-white font-display group-hover:text-amber-200 transition-colors">
                COUR / CONCESSION
              </h4>

              <p className="text-[11px] text-slate-300 leading-snug font-sans">
                Pour enregistrer un <strong>espace partagé</strong> contenant plusieurs constructions distinctes (Cour Mère <span className="font-mono text-amber-300">CRxxx</span> + Bâtiments Enfants <span className="font-mono text-amber-300">RA, RL1...</span>).
              </p>
            </div>
          </div>
        </motion.button>

        {/* OPTION B : BÂTIMENT DIRECT */}
        <motion.button
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectOption('direct')}
          className="w-full text-left p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-850 hover:from-slate-850 hover:to-slate-800 border-2 border-slate-700/80 hover:border-orange-500/80 transition-all shadow-xl group cursor-pointer relative overflow-hidden ring-1 ring-white/5"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-orange-500/10 transition-all" />

          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0 group-hover:scale-105 group-hover:bg-orange-500/25 transition-all">
              <Building2 className="w-6 h-6" />
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-orange-400 uppercase tracking-wide bg-orange-950/60 px-2 py-0.5 rounded border border-orange-500/30">
                  Option B
                </span>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-orange-300 flex items-center gap-1">
                  Parcours Direct <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

              <h4 className="text-sm font-bold text-white font-display group-hover:text-orange-200 transition-colors">
                BÂTIMENT DIRECT
              </h4>

              <p className="text-[11px] text-slate-300 leading-snug font-sans">
                Pour enregistrer une <strong>construction isolée / autonome</strong>, sans cour commune (ou donnant directement sur la voie publique).
              </p>
            </div>
          </div>
        </motion.button>
      </div>

      <div className="flex justify-between items-center pt-2">
        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-slate-800"
        >
          Annuler la saisie
        </button>
        <span className="text-[10px] font-mono text-slate-500">
          Machine d'état séquentielle
        </span>
      </div>
    </div>
  );
}
