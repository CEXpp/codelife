import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, KeyRound, Play, Sparkles, X, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import type { LLMConfigState } from '../types/codelife';

interface LLMConfigModalProps {
  open: boolean;
  onClose: () => void;
  config: LLMConfigState | null;
  onUpdated: (cfg: LLMConfigState) => void;
}

export const LLMConfigModal: React.FC<LLMConfigModalProps> = ({ open, onClose, config, onUpdated }) => {
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [temperature, setTemperature] = useState(0.35);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && config) {
      setEnabled(config.enabled);
      setBaseUrl(config.baseUrl);
      setApiKey(config.maskedApiKey || '');
      setModel(config.model);
      setTemperature(config.temperature);
      setStatusMsg(null);
    }
  }, [open, config]);

  if (!open) return null;

  const handleSave = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await api.updateLLMConfig({
        enabled,
        baseUrl,
        apiKey,
        model,
        temperature
      });
      onUpdated(res.config);
      setStatusMsg({ ok: true, text: 'AI 神经代码架构师配置已保存生效！' });
    } catch (err) {
      setStatusMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await api.updateLLMConfig({ enabled, baseUrl, apiKey, model, temperature });
      const res = await api.testLLMConnection();
      onUpdated(res.config);
      if (res.ok) {
        setStatusMsg({ ok: true, text: `连通性验证成功！延迟 ${res.latencyMs}ms` });
      } else {
        setStatusMsg({ ok: false, text: res.error || '连通性测试失败' });
      }
    } catch (err) {
      setStatusMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-3xl glass-panel overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-300" />
            <h2 className="text-base font-bold text-slate-100">双引擎认知代码架构师配置</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-slate-300 leading-relaxed">
            <div className="font-semibold text-cyan-200 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>当前架构：因果 AST 程序合成 + 心理沙盘回放（始终运行）</span>
            </div>
            即使不填写任何 API Key，内置因果 AST 引擎也会基于生命真实遥测与经验帧自主编写代码。启用下方大模型后，生命将额外获得自由度更高的跨范式程序创造能力，且所有输出仍必须经过严格安全沙箱编译与自然选择检验。
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/75 border border-slate-800 cursor-pointer">
            <div>
              <div className="font-semibold text-slate-200">启用外部大模型协同代码合成</div>
              <div className="text-[11px] text-slate-400">支持 OpenAI / DeepSeek / 通义 / 本地 Ollama 兼容接口</div>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-cyan-400"
            />
          </label>

          {/* Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400">快捷预设：</span>
            <button
              onClick={() => {
                setBaseUrl('https://api.deepseek.com/v1');
                setModel('deepseek-chat');
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              DeepSeek
            </button>
            <button
              onClick={() => {
                setBaseUrl('http://localhost:11434/v1');
                setModel('qwen2.5-coder:7b');
                setApiKey('ollama');
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              Ollama 本地
            </button>
            <button
              onClick={() => {
                setBaseUrl('https://api.openai.com/v1');
                setModel('gpt-4o-mini');
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              OpenAI
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-slate-400 mb-1">API Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">模型名称 (Model)</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">创造温度 ({temperature})</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full mt-2 accent-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> API Key (留空或保持掩码则不覆盖已有 Key)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Live Stats */}
          {config && (
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center font-mono">
              <div>
                <div className="text-slate-500 text-[10px]">LLM 请求次数</div>
                <div className="text-slate-200 text-sm font-semibold">{config.stats.requestsTotal}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">编译通过采纳</div>
                <div className="text-emerald-300 text-sm font-semibold">{config.stats.successTotal}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">沙箱安全拦截</div>
                <div className="text-amber-300 text-sm font-semibold">{config.stats.sandboxRejectedTotal}</div>
              </div>
            </div>
          )}

          {statusMsg && (
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                statusMsg.ok
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
              }`}
            >
              {statusMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              disabled={busy}
              onClick={handleTest}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> 测试连通
            </button>
            <button
              disabled={busy}
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/50 text-cyan-100 font-semibold"
            >
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
