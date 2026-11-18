import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Dna, GitBranch, RefreshCw, Skull, Sparkles, X } from 'lucide-react';
import { api } from '../services/api';
import type { PhylogenyNode, PhylogenyResponse } from '../types/codelife';

interface PhylogenyModalProps {
  open: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

export const PhylogenyModal: React.FC<PhylogenyModalProps> = ({ open, onClose, onSelectNode }) => {
  const [data, setData] = useState<PhylogenyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterAlive, setFilterAlive] = useState<'all' | 'alive' | 'dead'>('all');

  const fetchTree = async () => {
    setLoading(true);
    try {
      const res = await api.getPhylogeny();
      setData(res);
    } catch {
      // ignore fetch error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchTree();
  }, [open]);

  const layout = useMemo(() => {
    if (!data) {
      return {
        positions: new Map<string, { x: number; y: number; node: PhylogenyNode }>(),
        edges: [] as { from: string; to: string }[],
        width: 800,
        height: 420
      };
    }
    const filtered = data.nodes.filter((n) =>
      filterAlive === 'all' ? true : filterAlive === 'alive' ? n.alive : !n.alive
    );
    const visibleSet = new Set(filtered.map((n) => n.id));
    const byGen = new Map<number, PhylogenyNode[]>();
    let maxGen = 0;
    for (const n of filtered) {
      if (n.generation > maxGen) maxGen = n.generation;
      if (!byGen.has(n.generation)) byGen.set(n.generation, []);
      byGen.get(n.generation)!.push(n);
    }

    let maxRows = 1;
    for (const list of byGen.values()) {
      list.sort((a, b) => a.birthTick - b.birthTick);
      if (list.length > maxRows) maxRows = list.length;
    }

    const colW = 190;
    const rowH = 38;
    const width = Math.max(760, (maxGen + 1) * colW + 120);
    const height = Math.max(380, maxRows * rowH + 80);

    const positions = new Map<string, { x: number; y: number; node: PhylogenyNode }>();
    for (const [gen, list] of byGen.entries()) {
      const totalH = list.length * rowH;
      const startY = (height - totalH) / 2 + rowH / 2;
      list.forEach((node, idx) => {
        positions.set(node.id, {
          x: 75 + gen * colW,
          y: startY + idx * rowH,
          node
        });
      });
    }

    return {
      positions,
      edges: data.edges.filter((e) => visibleSet.has(e.from) && visibleSet.has(e.to)),
      width,
      height
    };
  }, [data, filterAlive]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4">
      <div className="w-full max-w-6xl h-[88vh] rounded-3xl glass-panel flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-violet-300" />
            <div>
              <h2 className="text-base font-bold text-slate-100">数字生命家族演化谱系与生态统计</h2>
              <p className="text-xs text-slate-400">
                点击任意节点（含已灭绝化石）即可在观测台回溯它的最终基因源码、修改历史与死因
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900 rounded-xl p-0.5 border border-slate-700 text-xs">
              {[
                ['all', '全部谱系'],
                ['alive', '仅存活'],
                ['dead', '灭绝化石']
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilterAlive(k as 'all' | 'alive' | 'dead')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    filterAlive === k ? 'bg-violet-500/25 text-violet-200' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={fetchTree}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="刷新图谱"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 min-h-0">
          {/* Left 2/3: Interactive SVG Tree */}
          <div className="lg:col-span-2 border-r border-slate-800/80 overflow-auto bg-[#050914] p-3">
            <svg width={layout.width} height={layout.height} className="block">
              {/* Edges */}
              {layout.edges.map((e, i) => {
                const fromPos = layout.positions.get(e.from);
                const toPos = layout.positions.get(e.to);
                if (!fromPos || !toPos) return null;
                const mx = (fromPos.x + toPos.x) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${fromPos.x} ${fromPos.y} C ${mx} ${fromPos.y}, ${mx} ${toPos.y}, ${toPos.x} ${toPos.y}`}
                    fill="none"
                    stroke={toPos.node.alive ? 'rgba(56, 189, 248, 0.35)' : 'rgba(100, 116, 139, 0.25)'}
                    strokeWidth={1.6}
                  />
                );
              })}

              {/* Nodes */}
              {[...layout.positions.values()].map(({ x, y, node }) => {
                const color = node.alive ? `hsl(${node.primaryHue}, 85%, 62%)` : '#64748b';
                return (
                  <g
                    key={node.id}
                    transform={`translate(${x}, ${y})`}
                    onClick={() => {
                      onSelectNode(node.id);
                      onClose();
                    }}
                    className="cursor-pointer group"
                  >
                    <circle
                      r={node.isAdopted ? 9 : 7}
                      fill={node.alive ? color : 'rgba(15, 23, 42, 0.9)'}
                      stroke={node.isAdopted ? '#fde047' : color}
                      strokeWidth={node.alive ? 2 : 1.5}
                      strokeDasharray={node.alive ? undefined : '2 2'}
                    />
                    <text
                      x={13}
                      y={-1}
                      fill={node.alive ? '#e2e8f0' : '#94a3b8'}
                      fontSize="11"
                      fontFamily="Inter, Noto Sans SC, sans-serif"
                    >
                      {node.isAdopted ? '★ ' : ''}{node.name} (v{node.codeVersion})
                    </text>
                    <text
                      x={13}
                      y={11}
                      fill="#64748b"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.alive ? node.speciesName : `† ${node.causeOfDeath || '逝去'}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Right 1/3: Species Distribution, Cultural Memes & Complexity Chart */}
          <div className="p-4 overflow-y-auto space-y-4 bg-slate-900/40">
            {/* Species Distribution */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Dna className="w-4 h-4 text-cyan-300" />
                <span>现存物种生态位分布 ({data?.speciesDistribution.length || 0})</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data?.speciesDistribution.map((sp) => (
                  <div key={sp.signature} className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: `hsl(${sp.hue}, 85%, 60%)` }}
                        />
                        {sp.name}
                      </span>
                      <span className="font-mono text-cyan-300">{sp.count} 只</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sp.traits.slice(0, 5).map((t) => (
                        <span key={t} className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cultural Memes Board */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>跨血缘文化模因传播榜</span>
              </div>
              {(!data?.culturalMemes || data.culturalMemes.length === 0) ? (
                <div className="text-[11px] text-slate-500 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  尚无生命主动演化出 `broadcastMeme` 文化广播模块，随着群体演化将继续观察到原始文化兴起。
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.culturalMemes.map((m) => (
                    <div
                      key={m.capabilityKey}
                      className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-mono text-amber-200">{m.capabilityKey}</div>
                        <div className="text-[10px] text-slate-400">源发先驱: {m.originatorName}</div>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <div className="text-emerald-300">习得 {m.adoptions}</div>
                        <div className="text-slate-400">广播 {m.broadcasts}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* History Curve */}
            {data && data.historySeries.length > 1 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-emerald-300" />
                  <span>种群与代码复杂度演化曲线</span>
                </div>
                <HistorySparkChart series={data.historySeries} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const HistorySparkChart: React.FC<{ series: PhylogenyResponse['historySeries'] }> = ({ series }) => {
  const w = 310;
  const h = 110;
  const maxPop = Math.max(10, ...series.map((s) => s.population));
  const maxAst = Math.max(120, ...series.map((s) => s.avgAstNodes));

  const toPath = (vals: number[], maxVal: number) =>
    vals
      .map((v, idx) => {
        const px = (idx / (vals.length - 1)) * (w - 16) + 8;
        const py = h - 14 - (v / maxVal) * (h - 24);
        return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <path d={toPath(series.map((s) => s.population), maxPop)} fill="none" stroke="#34d399" strokeWidth="2" />
        <path d={toPath(series.map((s) => s.avgAstNodes), maxAst)} fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="4 2" />
      </svg>
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span className="text-emerald-300">━ 种群数量 (现 {series[series.length - 1].population})</span>
        <span className="text-cyan-300">┄ 平均AST节点 ({series[series.length - 1].avgAstNodes})</span>
      </div>
    </div>
  );
};
