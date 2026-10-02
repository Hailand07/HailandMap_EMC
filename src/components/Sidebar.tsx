/**
 * HailandMap Admin — Barre latérale de navigation
 * Design Apple × Cyberpunk × Luxe Africain
 */
import React from 'react';
import {
  Map as MapIcon,
  CheckCircle,
  Building2,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Layers,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { View } from '../types';
import { motion } from 'motion/react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  view: View;
  onViewChange: (v: View) => void;
  isDark: boolean;
  adminName: string;
  pendingCount: number;
  conflictCount: number;
}

export default function Sidebar({
  isOpen,
  onToggle,
  view,
  onViewChange,
  isDark,
  adminName,
  pendingCount,
  conflictCount,
}: SidebarProps) {
  const palette = {
    bg: isDark ? '#0A0F1E' : '#F8F6F0',
    surface: isDark ? '#1A2540' : '#FFFFFF',
    border: isDark ? '#1E293B' : '#E2E8F0',
    text: isDark ? '#E2E8F0' : '#1B4332',
    muted: isDark ? '#94A3B8' : '#64748B',
    accent: '#00FFB2',
    gold: '#FFD700',
    active: isDark ? '#1E293B' : '#E8F5E9',
  };

  const navItems: { id: View; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    { id: 'carte', label: 'Carte Principale', icon: <MapIcon size={20} /> },
    {
      id: 'validations',
      label: 'Validations',
      icon: <CheckCircle size={20} />,
      badge: pendingCount,
      badgeColor: '#3B82F6',
    },
    {
      id: 'batiments',
      label: 'Bâtiments',
      icon: <Building2 size={20} />,
      badge: conflictCount,
      badgeColor: '#EF4444',
    },
    { id: 'zones', label: 'Zones', icon: <Layers size={20} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{
        width: isOpen ? 280 : 0,
        opacity: isOpen ? 1 : 0,
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full flex flex-col border-r overflow-hidden shrink-0"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
      }}
    >
      {/* Bouton fermeture en haut à droite */}
      <div className="flex items-center justify-end p-2">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-white/10 transition"
          title="Réduire le menu"
        >
          <ChevronLeft size={18} style={{ color: palette.gold }} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative"
              style={{
                backgroundColor: isActive ? palette.active : 'transparent',
                color: isActive ? palette.gold : palette.muted,
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <span
                style={{
                  color: isActive ? palette.gold : palette.muted,
                }}
              >
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: item.badgeColor || '#3B82F6',
                    color: '#FFFFFF',
                  }}
                >
                  {item.badge}
                </span>
              )}

              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                  style={{ backgroundColor: palette.gold }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Pied de sidebar */}
      <div
        className="p-4 border-t"
        style={{ borderColor: palette.border }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: palette.accent,
              color: '#0A0F1E',
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: palette.text }}>
              {adminName}
            </p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: palette.muted }}>
              Admin HailandX
            </p>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
