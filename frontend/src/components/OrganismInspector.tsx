import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Dna,
  Edit3,
  GitCommit,
  GitFork,
  Heart,
  Play,
  Send,
  Shield,
  Skull,
  Sparkles,
  Utensils,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import type { CodeCommit, OrganismDetail } from '../types/codelife';

interface OrganismInspectorProps {
  detail: OrganismDetail | null;
  onClose: () => void;
  onSelectOrganism: (id: string) => void;
  onOpenPhylogeny: () => void;
  onInteract: (
    id: string,
    payload: {
      action: 'adopt' | 'rename' | 'feed' | 'heal' | 'evolve' | 'patchCode';
      name?: string;
      mentorHint?: string;
      customCode?: string;
      reason?: string;
    }
  ) => Promise<void>;
}

type InspectorTab = 'mind' | 'dna' | 'commits' | 'lineage';

const MENTOR_PRESETS = [
  '识别毒孢子色相并预警同伴',
  '发出声波协作开采共鸣晶簇',
  '寒冬/酸雨提前避入热泉或建造庇护所',
  '日光充足时开启光合作用并窖藏能量',
  '能量充裕时哺育饥饿的亲属'
];

const VALIDATION_BADGE: Record<string, { label: string; cls: string }> = {
  BASELINE: { label: '创世基准', cls: 'bg-slate-700/60 text-slate-300 border-slate-600' },
  EVALUATING: { label: '实证追踪中', cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40 animate-pulse' },
  BENEFICIAL: { label: '验证有效 ↑', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' },
  NEUTRAL: { label: '平稳存续', cls: 'bg-slate-700/60 text-slate-200 border-slate-500/50' },
  DELETERIOUS: { label: '适应度下降 ↓', cls: 'bg-amber-500/20 text-amber-300 border-amber-400/40' },
  REVERTED_ON_CRASH: { label: '崩溃已回滚', cls: 'bg-orange-500/20 text-orange-300 border-orange-400/40' },
  FATAL_BUG: { label: '致命缺陷致死', cls: 'bg-rose-500/25 text-rose-300 border-rose-500/50' }
};

export const OrganismInspector: React.FC<OrganismInspectorProps> = ({
  detail,
  onClose,
  onSelectOrganism,
  onOpenPhylogeny,
  onInteract
}) => {
  const [tab, setTab] = useState<InspectorTab>('mind');
  const [mentorText, setMentorText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [surgeryMode, setSurgeryMode] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [surgeryReason, setSurgeryReason] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    if (detail) {
      setDraftCode(detail.code);
      setNameInput(detail.name);
      setSurgeryMode(false);
      setFeedbackMsg(null);
    }
  }, [detail?.id]);

  if (!detail) return null;

  const runAction = async (
    payload: Parameters<OrganismInspectorProps['onInteract']>[1],
    okNotice?: string
  ) => {
    setBusy(true);
    setFeedbackMsg(null);
    try {
      await onInteract(detail.id, payload);
      if (okNotice) setFeedbackMsg({ type: 'ok', text: okNotice });
    } catch (err) {
      setFeedbackMsg({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  // Map branch hit totals onto source line numbers
  const lineHits: Record<number, { total: number; last: number }> = {};
  for (const [tag, meta] of Object.entries(detail.branchLines || {})) {
    const ln = meta.line;
    if (!lineHits[ln]) lineHits[ln] = { total: 0, last: 0 };
    lineHits[ln].total += detail.branchHitsTotal?.[tag] || 0;
    lineHits[ln].last += detail.lastBranchHits?.[tag] || 0;
  }

  const codeLines = detail.code.split('\n');

  return (
    <aside className="fixed top-20 bottom-20 right-3 z-25 w-[440px] max-w-[94vw] rounded-2xl glass-panel flex flex-col overflow-hidden z-30">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-700/60 bg-slate-900/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditingName(false);
                    if (nameInput.trim()) runAction({ action: 'rename', name: nameInput.trim() });
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                    className="px-2 py-0.5 rounded bg-slate-950 border border-cyan-400 text-sm text-white outline-none w-36"
                  />
                  <button type="submit" className="text-xs px-2 py-0.5 rounded bg-cyan-500/25 text-cyan-200">
                    确定
                  </button>
                </form>
              ) : (
                <h2
                  onClick={() => detail.alive && setEditingName(true)}
                  className="text-base font-bold text-slate-100 truncate flex items-center gap-1.5 cursor-pointer hover:text-cyan-300"
                  title="点击重命名"
                >
                  <span>{detail.name}</span>
                  {detail.alive && <Edit3 className="w-3 h-3 text-slate-500" />}
                </h2>
              )}

              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                  detail.alive
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                    : 'bg-slate-700/50 text-slate-400 border-slate-600'
                }`}
              >
                {detail.alive ? '存活' : `化石 · ${detail.causeOfDeath || '已逝去'}`}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-1.5 mt-1 text-[11px] text-slate-400">
              <span className="text-cyan-300 font-medium">{detail.speciesName}</span>
              <span>·</span>
              <span className="font-mono">Gen-{detail.generation}</span>
              <span>·</span>
              <span className="font-mono text-amber-300">DNA v{detail.codeVersion}</span>
              <span>·</span>
              <span className="font-mono">{detail.age} 刻</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {detail.alive && (
              <button
                onClick={() => runAction({ action: 'adopt' })}
                className={`p-1.5 rounded-xl border transition ${
                  detail.isAdopted
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300'
                    : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-amber-300'
                }`}
                title={detail.isAdopted ? '已契约为专属伙伴（点击解除）' : '缔结契约认养为专属伙伴'}
              >
                <Heart className={`w-4 h-4 ${detail.isAdopted ? 'fill-amber-300' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Trait Badges */}
        <div className="flex flex-wrap gap-1 mt-2">
          {detail.traitsList.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-[10px] text-cyan-200"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Sub-Tabs */}
        <div className="grid grid-cols-4 gap-1 mt-3 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
          {[
            { id: 'mind', label: '心智陪伴', icon: <Brain className="w-3.5 h-3.5" /> },
            { id: 'dna', label: '活体源码', icon: <Code2 className="w-3.5 h-3.5" /> },
            { id: 'commits', label: `进化史(${detail.codeCommits.length})`, icon: <GitCommit className="w-3.5 h-3.5" /> },
            { id: 'lineage', label: '家族谱系', icon: <GitFork className="w-3.5 h-3.5" /> }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as InspectorTab)}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition ${
                tab === t.id
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`mx-3 mt-2 px-2.5 py-1.5 rounded-xl text-xs border flex items-center gap-1.5 ${
            feedbackMsg.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
              : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
          }`}
        >
          {feedbackMsg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {tab === 'mind' && (
          <>
            {/* Vitals */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>代谢能量</span>
                  <span className="font-mono text-emerald-300">
                    {detail.energy.toFixed(1)} / {detail.maxEnergy}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                    style={{ width: `${Math.min(100, (detail.energy / detail.maxEnergy) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>细胞生命值</span>
                  <span className="font-mono text-rose-300">
                    {detail.hp.toFixed(1)} / {detail.maxHp}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-400"
                    style={{ width: `${Math.min(100, (detail.hp / detail.maxHp) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Companion Care & Mentor Guidance */}
            {detail.alive && (
              <div className="p-3 rounded-xl bg-slate-900/75 border border-cyan-500/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    陪伴抚育 & 导师思维启示
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={busy}
                      onClick={() => runAction({ action: 'feed' }, '已投喂高纯能量甘露 (+38 能量)')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[11px]"
                    >
                      <Utensils className="w-3 h-3" /> 投喂
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => runAction({ action: 'heal' }, '已释放生态护盾修复')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-[11px]"
                    >
                      <Shield className="w-3 h-3" /> 护盾治愈
                    </button>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={mentorText}
                    onChange={(e) => setMentorText(e.target.value)}
                    placeholder="给出演化启示（它将自主决定如何改写代码）..."
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-950/90 border border-slate-700 text-xs text-slate-100 outline-none focus:border-cyan-400"
                  />
                  <button
                    disabled={busy}
                    onClick={() => {
                      const hint = mentorText.trim();
                      runAction({ action: 'evolve', mentorHint: hint }, '生命体已完成自主反思并尝试修改自身源码');
                      setMentorText('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/50 text-cyan-100 text-xs font-medium flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3 h-3" /> 启示改写
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {MENTOR_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setMentorText(preset)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700/70"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Personality Neuro-Modulators */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">神经调质性格（随经历动态演化）</div>
              <div className="space-y-1.5 text-[11px]">
                {[
                  { key: 'curiosity', label: '探索好奇心', color: 'bg-cyan-400' },
                  { key: 'caution', label: '风险谨慎度', color: 'bg-amber-400' },
                  { key: 'sociability', label: '群居协作性', color: 'bg-emerald-400' },
                  { key: 'aggression', label: '攻击掠食欲', color: 'bg-rose-400' },
                  { key: 'resilience', label: '环境抗逆性', color: 'bg-violet-400' }
                ].map((axis) => {
                  const val = (detail.personality as Record<string, number>)?.[axis.key] ?? 0.5;
                  return (
                    <div key={axis.key} className="flex items-center gap-2">
                      <span className="w-20 text-slate-400">{axis.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full ${axis.color}`} style={{ width: `${Math.round(val * 100)}%` }} />
                      </div>
                      <span className="w-9 text-right font-mono text-slate-300">{Math.round(val * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Perception -> Action Decoder */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5 text-[11px]">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>实时大脑感知 → 行为决策</span>
                <span className="font-mono text-[10px] text-cyan-300">{detail.lastAction?.type as string || 'rest'}</span>
              </div>
              <pre className="p-2 rounded-lg bg-slate-950/90 border border-slate-800/80 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                {JSON.stringify(
                  {
                    sensors: detail.lastSensorsSummary,
                    perception: detail.lastPerception,
                    action: detail.lastAction
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            {/* Episodic Memory Log */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">生平记忆时间轴</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {detail.episodicLog.map((ep, idx) => (
                  <div key={idx} className="text-[11px] flex gap-2 border-l-2 border-cyan-500/35 pl-2 py-0.5">
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">T:{ep.tick}</span>
                    <span className="text-slate-300">{ep.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'dna' && (
          <>
            {/* Sandbox Compute & Gas Meter */}
            <div className="p-2.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>沙箱算力代谢 ({detail.lastGasUsed} / {detail.gasLimit} gas)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  AST {detail.astNodeCount} 节点 · 均值 {detail.avgGas} gas
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
                  style={{ width: `${Math.min(100, (detail.lastGasUsed / detail.gasLimit) * 100)}%` }}
                />
              </div>

              {detail.alive && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    disabled={busy}
                    onClick={() => runAction({ action: 'evolve' }, '已触发自主反思与代码编译迭代')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-medium"
                  >
                    <Zap className="w-3.5 h-3.5" /> 立即诱发自我反思重写
                  </button>
                  <button
                    onClick={() => {
                      setDraftCode(detail.code);
                      setSurgeryMode((s) => !s);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${
                      surgeryMode
                        ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" /> {surgeryMode ? '返回热力图' : '基因手术室'}
                  </button>
                </div>
              )}
            </div>

            {surgeryMode ? (
              <div className="space-y-2">
                <div className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2">
                  基因手术室：可直接修改源码并在隔离沙箱试编译部署。若包含危险 API 或死循环将被 Acorn 安全审计拦截或触发代谢惩罚。
                </div>
                <input
                  type="text"
                  value={surgeryReason}
                  onChange={(e) => setSurgeryReason(e.target.value)}
                  placeholder="填写本次基因修改备注（将记录入 Git 提交史）"
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 outline-none focus:border-amber-400"
                />
                <textarea
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  spellCheck={false}
                  rows={18}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-[11px] leading-5 text-emerald-200 outline-none focus:border-cyan-400"
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      {
                        action: 'patchCode',
                        customCode: draftCode,
                        reason: surgeryReason.trim() || '观察者手动编辑基因手术部署'
                      },
                      '基因补丁已通过安全沙箱编译并部署生效！'
                    )
                  }
                  className="w-full py-2 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-100 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> 编译并写入生命 DNA
                </button>
              </div>
            ) : (
              /* Live Code Profiler with Branch Hit Heat Badges */
              <div className="rounded-xl bg-slate-950/90 border border-slate-800 overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">genome_v{detail.codeVersion}.js</span>
                  <span>左侧栏显示 AST 分支实时命中计数</span>
                </div>
                <div className="p-2 overflow-x-auto max-h-[380px] overflow-y-auto font-mono text-[11px] leading-5">
                  {codeLines.map((line, idx) => {
                    const lineNo = idx + 1;
                    const hit = lineHits[lineNo];
                    const isHot = hit && hit.last > 0;
                    return (
                      <div
                        key={lineNo}
                        className={`flex items-center gap-2 px-1 rounded min-w-max ${
                          isHot ? 'bg-cyan-500/10' : ''
                        }`}
                      >
                        <span className="w-6 text-right text-slate-600 select-none shrink-0">{lineNo}</span>
                        <span className="w-12 shrink-0 flex justify-end">
                          {hit ? (
                            <span
                              className={`px-1 rounded text-[9px] border ${
                                hit.last > 0
                                  ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                              title={`累计执行 ${hit.total} 次，上刻命中 ${hit.last} 次`}
                            >
                              ×{hit.total}
                            </span>
                          ) : null}
                        </span>
                        <span className="whitespace-pre text-slate-200">{line || ' '}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Working Memory JSON */}
            <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
              <div className="text-xs font-semibold text-slate-300">长期工作记忆 (memory JSON · 上限 4KB)</div>
              <pre className="p-2 rounded-lg bg-slate-950/90 font-mono text-[10px] text-amber-200/90 overflow-x-auto max-h-28">
                {JSON.stringify(detail.memory, null, 2)}
              </pre>
            </div>
          </>
        )}

        {tab === 'commits' && (
          <div className="space-y-3">
            {[...detail.codeCommits].reverse().map((commit) => (
              <CommitCard key={commit.id} commit={commit} />
            ))}
          </div>
        )}

        {tab === 'lineage' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-200">AST 演化能力矩阵</div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  ['hasPhotosynthesis', '光合自养'],
                  ['hasCoopCrystal', '声波协晶'],
                  ['hasToxinMemory', '识毒记忆'],
                  ['hasShelterLogic', '避险筑巢'],
                  ['hasCacheLogic', '储粮窖藏'],
                  ['hasShareEnergy', '亲缘互助'],
                  ['hasDefend', '防御警报'],
                  ['hasScavenge', '腐食清道'],
                  ['hasAttack', '主动掠食'],
                  ['hasMemeShare', '文化模因']
                ].map(([k, label]) => {
                  const active = Boolean(detail.capabilities?.[k]);
                  return (
                    <div
                      key={k}
                      className={`px-2 py-1 rounded-lg border flex items-center justify-between ${
                        active
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="font-mono text-[10px]">{active ? '已演化' : '未激活'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Parents */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">亲代祖先 ({detail.parentIds.length})</div>
              {detail.parentIds.length === 0 ? (
                <div className="text-[11px] text-slate-500">创世原初一代 (Gen-0)</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {detail.parentIds.map((pid) => (
                    <button
                      key={pid}
                      onClick={() => onSelectOrganism(pid)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-500/20 border border-slate-700 hover:border-cyan-400/40 text-xs font-mono text-cyan-200"
                    >
                      ← {pid}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Children */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">直系子代 ({detail.childrenIds.length})</div>
              {detail.childrenIds.length === 0 ? (
                <div className="text-[11px] text-slate-500">尚无繁殖后代</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {detail.childrenIds.map((cid) => (
                    <button
                      key={cid}
                      onClick={() => onSelectOrganism(cid)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-400/40 text-xs font-mono text-emerald-200"
                    >
                      → {cid}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onOpenPhylogeny}
              className="w-full py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-200 text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <GitFork className="w-3.5 h-3.5" /> 在全屏演化谱系树中定位家族脉络
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

const CommitCard: React.FC<{ commit: CodeCommit }> = ({ commit }) => {
  const [expanded, setExpanded] = useState(Boolean(commit.diffPatch));
  const vBadge = VALIDATION_BADGE[commit.validation.status] || VALIDATION_BADGE.NEUTRAL;
  const diffLines = commit.diffPatch ? commit.diffPatch.split('\n') : [];

  return (
    <div className="p-3 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 font-mono text-[11px] text-cyan-200">
            v{commit.version}
          </span>
          <span className="text-[10px] font-mono text-slate-400">{commit.source}</span>
          <span className="text-[10px] font-mono text-slate-500">T:{commit.tick}</span>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${vBadge.cls}`}>
          {vBadge.label}
        </span>
      </div>

      <div className="text-xs text-slate-200 leading-relaxed">
        <span className="text-slate-400">原因：</span>
        {commit.reason}
      </div>
      <div className="text-[11px] text-slate-300 bg-slate-950/60 px-2 py-1.5 rounded-lg border border-slate-800/80">
        <span className="text-amber-300">假设：</span>
        {commit.hypothesis}
      </div>

      <div className="text-[11px] text-slate-400 flex items-center justify-between">
        <span>实证结论：{commit.validation.summary}</span>
        {commit.replayScore !== null && (
          <span className="font-mono text-cyan-300">沙盘分 {commit.replayScore}</span>
        )}
      </div>

      {commit.speciesBefore !== commit.speciesAfter && (
        <div className="text-[10px] font-mono text-violet-300">
          物种签名跃迁: {commit.speciesBefore} → {commit.speciesAfter}
        </div>
      )}

      {diffLines.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-cyan-300 hover:underline font-mono"
          >
            {expanded ? '▼ 收起源码 Diff 对比' : `▶ 展开源码 Diff (${diffLines.length} 行)`}
          </button>
          {expanded && (
            <pre className="mt-1.5 p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] leading-4 overflow-x-auto max-h-56">
              {diffLines.map((line, i) => {
                if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('Index:') || line.startsWith('===')) {
                  return null;
                }
                const cls = line.startsWith('+')
                  ? 'bg-emerald-500/15 text-emerald-300 block px-1'
                  : line.startsWith('-')
                    ? 'bg-rose-500/15 text-rose-300 block px-1'
                    : line.startsWith('@@')
                      ? 'text-cyan-400 block px-1'
                      : 'text-slate-400 block px-1';
                return (
                  <code key={i} className={cls}>
                    {line}
                  </code>
                );
              })}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
