import React, { useState } from 'react';
import {
  Activity,
  BookmarkPlus,
  Cpu,
  Dna,
  FastForward,
  GitBranch,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Thermometer,
  CloudRain,
  Snowflake,
  Wind
} from 'lucide-react';
import type { LLMConfigState, WorldFrame } from '../types/codelife';

interface TopObservatoryBarProps {
  frame: WorldFrame | null;
  wsConnected: boolean;
  llmConfig: LLMConfigState | null;
  snapshots: { name: string; updatedAt: string; sizeKb: number }[];
  onSetSpeed: (speed: number) => void;
  onResetWorld: () => void;
  onSaveSnapshot: (name: string) => void;
  onLoadSnapshot: (name: string) => void;
  onOpenPhylogeny: () => void;
  onOpenLLMModal: () => void;
}

const SEASON_LABELS: Record<string, { label: string; color: string }> = {
  spring: { label: '春·复苏', color: 'text-emerald-300' },
  summer: { label: '夏·光年', color: 'text-amber-300' },
  autumn: { label: '秋·蓄能', color: 'text-orange-300' },
  winter: { label: '冬·冰期', color: 'text-sky-300' }
};

const WEATHER_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  clear: { label: '晴朗', icon: <Sun className="w-3.5 h-3.5 text-amber-300" /> },
  breeze: { label: '微风', icon: <Wind className="w-3.5 h-3.5 text-cyan-300" /> },
  acidRain: { label: '酸雨风暴', icon: <CloudRain className="w-3.5 h-3.5 text-lime-400 animate-pulse" /> },
  meteor: { label: '星晶流星', icon: <Sparkles className="w-3.5 h-3.5 text-violet-300 animate-pulse" /> },
  coldSnap: { label: '极寒骤降', icon: <Snowflake className="w-3.5 h-3.5 text-sky-300 animate-pulse" /> }
};

export const TopObservatoryBar: React.FC<TopObservatoryBarProps> = ({
  frame,
  wsConnected,
  llmConfig,
  snapshots,
  onSetSpeed,
  onResetWorld,
  onSaveSnapshot,
  onLoadSnapshot,
  onOpenPhylogeny,
  onOpenLLMModal
}) => {
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [snapName, setSnapName] = useState('');

  const seasonInfo = SEASON_LABELS[frame?.season || 'spring'];
  const weatherInfo = WEATHER_LABELS[frame?.weather || 'clear'];
  const speed = frame?.speedMultiplier ?? 1;

  return (
    <header className="fixed top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl glass-panel">
      {/* Brand + World Time & Climate */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700/60">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.28)]">
            <Dna className="w-4 h-4 text-cyan-300" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400'
              }`}
              title={wsConnected ? '实时遥测流已连接' : '连接中断'}
            />
          </div>
          <div className="leading-tight whitespace-nowrap">
            <div className="text-sm font-semibold tracking-wide text-slate-100 flex items-center gap-1.5">
              <span>CodeLife</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                源初盆地
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              纪元 {frame?.epoch ?? 1} · Tick {frame?.tick ?? 0}
            </div>
          </div>
        </div>

        {/* Climate Pills */}
        <div className="hidden xl:flex items-center gap-2 text-xs">
          <span className={`px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-700/60 font-medium ${seasonInfo.color}`}>
            {seasonInfo.label}
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-700/60 text-slate-200">
            {weatherInfo.icon}
            <span>{weatherInfo.label}</span>
            {frame?.pressureDrop && (
              <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                气压骤降前兆
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-700/60 font-mono text-slate-300">
            <Thermometer className="w-3.5 h-3.5 text-rose-300" />
            {frame?.temperature ?? 20}°C
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/70 border border-slate-700/60 font-mono text-slate-300">
            <Sun className="w-3.5 h-3.5 text-amber-300" />
            {Math.round((frame?.sunlight ?? 0.8) * 100)}%
          </span>
        </div>
      </div>

      {/* Key Ecological Metrics */}
      <div className="hidden md:flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
        <div className="px-2 py-1 rounded-xl bg-slate-900/70 border border-slate-700/50 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-400">存活</span>
          <span className="text-emerald-300 font-semibold">{frame?.stats.population ?? 0}</span>
        </div>
        <div className="px-2 py-1 rounded-xl bg-slate-900/70 border border-slate-700/50 flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="text-slate-400">物种</span>
          <span className="text-violet-300 font-semibold">{frame?.stats.speciesCount ?? 0}</span>
        </div>
        <div className="px-2 py-1 rounded-xl bg-slate-900/70 border border-slate-700/50 flex items-center gap-1.5">
          <Dna className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-slate-400">提交</span>
          <span className="text-cyan-300 font-semibold">{frame?.stats.totalCommits ?? 0}</span>
        </div>
        <div className="hidden lg:flex px-2 py-1 rounded-xl bg-slate-900/70 border border-slate-700/50 items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">模因</span>
          <span className="text-amber-300 font-semibold">{frame?.stats.cultureCount ?? 0}</span>
        </div>
      </div>

      {/* Controls & Research Modals */}
      <div className="flex items-center gap-1.5">
        {/* Speed Controls */}
        <div className="flex items-center bg-slate-900/80 border border-slate-700/60 rounded-xl p-0.5">
          {[
            { v: 0, label: <Pause className="w-3.5 h-3.5" />, title: '暂停模拟' },
            { v: 1, label: <Play className="w-3.5 h-3.5" />, title: '1x 常速' },
            { v: 2, label: '2x', title: '2x 加速' },
            { v: 5, label: '5x', title: '5x 演化加速' },
            { v: 12, label: <FastForward className="w-3.5 h-3.5" />, title: '12x 极速演化' }
          ].map((btn) => (
            <button
              key={btn.v}
              title={btn.title}
              onClick={() => onSetSpeed(btn.v)}
              className={`px-2 py-1 rounded-lg text-xs font-mono transition flex items-center justify-center ${
                speed === btn.v
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Phylogeny Modal Button */}
        <button
          onClick={onOpenPhylogeny}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-400/35 text-violet-200 text-xs font-medium transition whitespace-nowrap"
          title="查看完整生命演化树与灭绝化石"
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">演化谱系</span>
        </button>

        {/* AI Neural Engine Button */}
        <button
          onClick={onOpenLLMModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition whitespace-nowrap ${
            llmConfig?.enabled
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
              : 'bg-slate-800/80 border-slate-600/60 text-slate-300 hover:bg-slate-700/80'
          }`}
          title="配置外部大模型神经架构师（默认运行本地因果 AST 引擎）"
        >
          <Cpu className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{llmConfig?.enabled ? 'LLM+AST双擎' : 'AST自研引擎'}</span>
        </button>

        {/* Snapshot Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSnapMenu((s) => !s)}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/60 text-slate-300 transition"
            title="世界时间线快照存档"
          >
            <BookmarkPlus className="w-4 h-4" />
          </button>

          {showSnapMenu && (
            <div className="absolute right-0 mt-2 w-64 p-3 rounded-xl glass-panel z-50 space-y-2.5">
              <div className="text-xs font-semibold text-slate-200">生态时间线快照</div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={snapName}
                  onChange={(e) => setSnapName(e.target.value)}
                  placeholder="快照名称 (可选)"
                  className="flex-1 px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-700 text-xs text-slate-200 outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => {
                    onSaveSnapshot(snapName.trim() || `epoch${frame?.epoch || 1}_t${frame?.tick || 0}`);
                    setSnapName('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs hover:bg-cyan-500/35"
                >
                  保存
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {snapshots.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-1">暂无手动快照（世界每 240 刻自动存盘）</div>
                ) : (
                  snapshots.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => {
                        onLoadSnapshot(s.name);
                        setShowSnapMenu(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-slate-200">{s.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{s.sizeKb}KB</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Reset Genesis */}
        <button
          onClick={() => {
            if (window.confirm('确定要重新初始化源初盆地（重新投放 Gen-0 原初生命）吗？')) {
              onResetWorld();
            }
          }}
          className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/25 border border-slate-600/60 hover:border-rose-400/40 text-slate-300 hover:text-rose-200 transition"
          title="重置创世实验"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
