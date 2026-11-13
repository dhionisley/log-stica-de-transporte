import React from 'react';
import { Bus, CheckCircle2, Server, Database, Activity, MapPin } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Painel Operacional — Milestone M0
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Fundação de Engenharia com arquitetura multitenant, RLS, Outbox/Inbox e Tracing ativo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Backend API</span>
            <Server className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">NestJS 11</span>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Online
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Health/Ready + Tracing W3C</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Banco de Dados</span>
            <Database className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">PostGIS 17</span>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> RLS Ativo
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Migrations SHA-256</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Mensageria Confiável</span>
            <Activity className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">Outbox / Inbox</span>
            <span className="text-xs text-emerald-600 font-medium">Idempotente</span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Redis 7 + PostgreSQL</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Veículos Ativos</span>
            <Bus className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">0</span>
            <span className="text-xs text-slate-400 font-medium">Pré-operação</span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Cadastro na Etapa M2</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Central de Operações (Pré-visualização de Casca para M6)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Estrutura de layout preparada para visualização de frota, mapa e telemetria em tempo real.
            </p>
          </div>
          <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Roadmap M6
          </span>
        </div>

        <div className="mt-6 border-2 border-dashed border-slate-200 rounded-lg p-12 text-center bg-slate-50/50">
          <MapPin className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Área da Central de Rastreamento</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Neste container será acoplado o mapa interativo, a lista de viagens em andamento e o painel de telemetria dos veículos e motoristas na Etapa M6.
          </p>
        </div>
      </div>
    </div>
  );
}

