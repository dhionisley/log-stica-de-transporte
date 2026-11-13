import React from 'react';
import { Bell, Activity, Building2 } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Tenant Operacional</span>
          <span className="text-xs text-slate-400">| ID: 00000000...0001</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 font-medium">
          <Activity className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
          <span>API & Outbox Online</span>
        </div>

        <button
          type="button"
          aria-label="Notificações"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600" />
        </button>

        <div className="h-8 w-8 rounded-full bg-slate-800 text-white font-medium flex items-center justify-center text-xs shadow-sm">
          AD
        </div>
      </div>
    </header>
  );
}

