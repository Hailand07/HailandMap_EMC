import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  setAccessToken: (t: string) => void;
  /** Appelé après l'enregistrement du jeton (pour afficher une confirmation). */
  onSaved: () => void;
}

/** Fenêtre des paramètres : jeton d'accès Mapbox de l'appareil. */
export const SettingsModal: React.FC<Props> = ({ open, onClose, accessToken, setAccessToken, onSaved }) => (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Entête */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-white font-bold">Paramètres cartographiques</h3>
                </div>
                <button
                  onClick={() => onClose()}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Contenu */}
              <div className="p-5 overflow-y-auto space-y-5">
                
                {/* Section 1 : Cle publique Mapbox */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Clé d'accès Mapbox (Token)</label>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                    L'application utilise une clé publique d'usine par défaut. Pour optimiser les performances 3D ou utiliser vos propres couches, configurez votre jeton Mapbox ci-dessous. Il sera mémorisé localement dans votre navigateur.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="password"
                      placeholder="pk.eyJ1Ijo..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500/80 transition-all shadow-inner"
                    />
                    <button
                      onClick={() => {
                        localStorage.setItem('hailandmap_token', accessToken);
                        onSaved();
                        onClose();
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition active:scale-[0.97] cursor-pointer shadow-md shadow-indigo-600/10"
                    >
                      Appliquer
                    </button>
                  </div>
                </div>

                {/* Section 2 : Informations Système */}
                <div className="border-t border-slate-800/60 pt-4 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">Informations Système</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="p-2.5 bg-slate-950/40 border border-slate-800/40 rounded-lg">
                      <span className="text-slate-500 text-[9px] uppercase">Réseau d'Urbanisme</span>
                      <span className="block text-slate-300 mt-0.5">Souverain - Conakry</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 border border-slate-800/40 rounded-lg">
                      <span className="text-slate-500 text-[9px] uppercase">Stockage local</span>
                      <span className="block text-slate-300 mt-0.5">Activé (LocalStorage)</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Pied */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/10 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>HailandMap Studio</span>
                <span>v3.0.0</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
);
