import React from 'react';
import {
  LayoutDashboard,
  Navigation2,
  CalendarDays,
  Bus,
  Users2,
  UserCheck,
  Receipt,
  Settings,
  ShieldCheck,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  active?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Visão Geral', href: '/', icon: LayoutDashboard, active: true },
  { label: 'Central de Operações', href: '/operations', icon: Navigation2, badge: 'M6' },
  { label: 'Viagens & Serviços', href: '/trips', icon: CalendarDays },
  { label: 'Veículos & Frota', href: '/fleet', icon: Bus },
  { label: 'Motoristas & Escalas', href: '/drivers', icon: UserCheck },
  { label: 'Passageiros', href: '/passengers', icon: Users2 },
  { label: 'Faturamento', href: '/billing', icon: Receipt },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-slate-200 min-h-screen flex flex-col border-r border-slate-800">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-lg shadow-sm">
          T
        </div>
        <div>
          <span className="font-semibold text-white tracking-tight">Transport Platform</span>
          <span className="block text-xs text-slate-400">Portal Operacional</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold uppercase text-slate-400 px-3 pb-2 tracking-wider">
          Módulos
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
        <div className="flex items-center gap-2 mb-1 text-slate-300">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="font-medium">Isolamento Multitenant</span>
        </div>
        <p className="text-[11px] text-slate-400">RLS + Auditoria ativos no backend</p>
      </div>
    </aside>
  );
}

