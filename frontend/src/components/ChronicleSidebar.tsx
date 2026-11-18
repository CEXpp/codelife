import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Heart,
  Radio,
  RotateCcw,
  Skull,
  Sparkles,
  Users
} from 'lucide-react';
import type { ChronicleEvent, OrganismSummary } from '../types/codelife';

interface ChronicleSidebarProps {
  organisms: OrganismSummary[];
  events: ChronicleEvent[];
  selectedId: string | null;
  onSelectOrganism: (id: string) => void;
}

const EVENT_BADGES: Record<string, { label: string; color: string }> = {
  SPECIATION: { label: '新物种跃迁', color: 'text-violet-300 bg-violet-500/15 border-violet-400/40' },
  EMERGENCE: { label: '行为涌现', color: 'text-amber-300 bg-amber-500/15 border-amber-400/40' },
  CODE_EVOLVE: { label: '自我编程', color: 'text-cyan-300 bg-cyan-500/15 border-cyan-400/40' },
  CULTURE: { label: '文化传薪', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40' },
  ROLLBACK: { label: '崩溃自愈', color: 'text-orange-300 bg-orange-500/15 border-orange-400/40' },
  PREDATION: { label: '自然捕食', color: 'text-rose-300 bg-rose-500/15 border-rose-400/40' },
  DEATH: { label: '生命终结', color: 'text-slate-400 bg-slate-700/40 border-slate-600/40' },
  WEATHER: { label: '气象剧变', color: 'text-sky-300 bg-sky-500/15 border-sky-400/40' },
  CLIMATE: { label: '季节更迭', color: 'text-teal-300 bg-teal-500/15 border-teal-400/40' },
  ECOSYSTEM: { label: '环境改造', color: 'text-emerald-200 bg-emerald-500/15 border-emerald-400/40' },
  GOD_ACTION: { label: '造物干预', color: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-400/40' },
  GENESIS: { label: '世界创生', color: 'text-cyan-200 bg-cyan-500/20 border-cyan-400/40' }
};

export const ChronicleSidebar: React.FC<ChronicleSidebarProps> = ({
  organisms,
  events,
  selectedId,
  onSelectOrganism
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const adopted = organisms.filter((o) => o.isAdopted);
  const topEvolved = [...organisms]
    .sort((a, b) => b.codeVersion - a.codeVersion || b.generation - a.generation)
    .slice(0, 3);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed top-20 left-3 z-20 p-2.5 rounded-xl glass-panel text-slate-300 hover:text-cyan-300 transition"
        title="展开伙伴与演化纪年史"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  return (
    <aside className="fixed top-20 bottom-20 left-3 z-20 w-72 flex flex-col gap-2.5 pointer-events-auto">
      {/* Adopted Companions / Top Evolved Highlights */}
      <div className="p-3 rounded-2xl glass-panel flex flex-col gap-2 max-h-[42%] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Heart className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
            <span>我的数字伙伴 ({adopted.length})</span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-lg hover:bg-slate-800/70 text-slate-400 hover:text-slate-200"
            title="收起侧栏"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {adopted.length === 0 ? (
          <div className="text-[11px] text-slate-400 bg-slate-900/50 rounded-xl p-2 border border-slate-800/80">
            点击画布任意生命并在右侧「缔结契约」，即可长期守护并引导它的自我编程演化。
          </div>
        ) : (
          <div className="space-y-1.5">
            {adopted.map((org) => (
              <button
                key={org.id}
                onClick={() => onSelectOrganism(org.id)}
                className={`w-full text-left p-2 rounded-xl border transition ${
                  selectedId === org.id
                    ? 'bg-cyan-500/15 border-cyan-400/50'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-200 truncate">{org.name}</span>
                  <span className="font-mono text-[10px] text-cyan-300">
                    Gen-{org.generation} · v{org.codeVersion}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{org.speciesName}</div>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden" title={`能量 ${org.energy}`}>
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${Math.min(100, (org.energy / org.maxEnergy) * 100)}%` }}
                    />
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden" title={`生命 ${org.hp}`}>
                    <div
                      className="h-full bg-rose-400 transition-all"
                      style={{ width: `${Math.min(100, (org.hp / org.maxHp) * 100)}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Quick jump to highest code-evolved organisms */}
        {topEvolved.length > 0 && (
          <div className="pt-1 border-t border-slate-800/80">
            <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span>当前演化先锋</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {topEvolved.map((org) => (
                <button
                  key={org.id}
                  onClick={() => onSelectOrganism(org.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono border transition ${
                    selectedId === org.id
                      ? 'bg-violet-500/25 border-violet-400/50 text-violet-200'
                      : 'bg-slate-900/70 border-slate-700/70 text-slate-300 hover:border-violet-400/40'
                  }`}
                >
                  {org.name} (v{org.codeVersion})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Chronicle Stream */}
      <div className="flex-1 p-3 rounded-2xl glass-panel flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>生态演化纪年史</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">LIVE</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {events.map((ev) => {
            const badge = EVENT_BADGES[ev.kind] || {
              label: ev.kind,
              color: 'text-slate-300 bg-slate-800 border-slate-700'
            };
            const clickable = Boolean(ev.organismId);
            return (
              <div
                key={ev.id}
                onClick={() => ev.organismId && onSelectOrganism(ev.organismId)}
                className={`p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] leading-relaxed transition ${
                  clickable ? 'cursor-pointer hover:border-cyan-500/40 hover:bg-slate-800/60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] border ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">T:{ev.tick}</span>
                </div>
                <p className="text-slate-300">{ev.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
