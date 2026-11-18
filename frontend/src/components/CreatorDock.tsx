import React from 'react';
import {
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Flame,
  Gem,
  GitFork,
  Layers,
  Radio,
  Snowflake,
  Sparkles,
  Sprout
} from 'lucide-react';
import type { CanvasLayers, GodTool } from '../types/codelife';

interface CreatorDockProps {
  activeTool: GodTool;
  onSelectTool: (tool: GodTool) => void;
  layers: CanvasLayers;
  onToggleLayer: (key: keyof CanvasLayers) => void;
  followSelected: boolean;
  onToggleFollow: () => void;
}

const TOOLS: { id: GodTool; label: string; hint: string; icon: React.ReactNode; accent: string }[] = [
  {
    id: 'observe',
    label: '观测选中',
    hint: '点击生物查看大脑与源码，拖拽平移画布',
    icon: <Compass className="w-4 h-4" />,
    accent: 'text-cyan-300 border-cyan-400/50 bg-cyan-500/20'
  },
  {
    id: 'nectar',
    label: '降下甘露',
    hint: '点击画布投放高能甘露集群',
    icon: <Droplets className="w-4 h-4" />,
    accent: 'text-emerald-300 border-emerald-400/50 bg-emerald-500/20'
  },
  {
    id: 'crystal',
    label: '共鸣晶簇',
    hint: '投放需 2+ 生命协作才能破译的高能晶簇',
    icon: <Gem className="w-4 h-4" />,
    accent: 'text-violet-300 border-violet-400/50 bg-violet-500/20'
  },
  {
    id: 'spore',
    label: '变异孢子',
    hint: '投放带化学色相的孢子（含毒与营养）',
    icon: <Sparkles className="w-4 h-4" />,
    accent: 'text-amber-300 border-amber-400/50 bg-amber-500/20'
  },
  {
    id: 'hotSpring',
    label: '开辟热泉',
    hint: '创造恒温热泉绿洲，提供寒冬庇护',
    icon: <Flame className="w-4 h-4" />,
    accent: 'text-orange-300 border-orange-400/50 bg-orange-500/20'
  },
  {
    id: 'acidRain',
    label: '酸雨考验',
    hint: '立即触发酸雨风暴，筛选筑巢与避险代码',
    icon: <CloudRain className="w-4 h-4" />,
    accent: 'text-lime-300 border-lime-400/50 bg-lime-500/20'
  },
  {
    id: 'coldSnap',
    label: '寒潮试炼',
    hint: '立即触发骤冷寒潮',
    icon: <Snowflake className="w-4 h-4" />,
    accent: 'text-sky-300 border-sky-400/50 bg-sky-500/20'
  },
  {
    id: 'seed',
    label: '投放原初',
    hint: '在指定坐标诞生一只新 Gen-0 原初生命',
    icon: <Sprout className="w-4 h-4" />,
    accent: 'text-teal-300 border-teal-400/50 bg-teal-500/20'
  }
];

export const CreatorDock: React.FC<CreatorDockProps> = ({
  activeTool,
  onSelectTool,
  layers,
  onToggleLayer,
  followSelected,
  onToggleFollow
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl glass-panel max-w-[96vw] overflow-x-auto">
      {/* God Action Tools */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-700/60">
        {TOOLS.map((t) => {
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              title={t.hint}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap border ${
                active
                  ? `${t.accent} shadow-[0_0_12px_rgba(34,211,238,0.18)]`
                  : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Camera Follow & Observation Layers */}
      <div className="flex items-center gap-1 text-xs">
        <button
          onClick={onToggleFollow}
          title="镜头自动追踪当前选中的数字生命"
          className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border transition ${
            followSelected
              ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden md:inline">追踪</span>
        </button>

        <button
          onClick={() => onToggleLayer('showBiomes')}
          title="显示生态群落分区光晕与标签"
          className={`p-1.5 rounded-xl border transition ${
            layers.showBiomes
              ? 'bg-slate-700/80 border-slate-500/60 text-slate-100'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onToggleLayer('showVision')}
          title="显示选中生命的感知视野与声波监听圈"
          className={`p-1.5 rounded-xl border transition ${
            layers.showVision
              ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onToggleLayer('showKinLinks')}
          title="绘制同家族血缘连线"
          className={`p-1.5 rounded-xl border transition ${
            layers.showKinLinks
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
