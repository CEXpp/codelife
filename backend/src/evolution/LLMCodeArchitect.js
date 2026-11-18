import { createTwoFilesPatch } from 'diff';
import { compileGenome } from '../sandbox/GenomeSandbox.js';
import { SANDBOX_API_SPEC } from './GenesisGenomes.js';

export class LLMCodeArchitect {
  constructor() {
    this.config = {
      enabled: Boolean(process.env.CODELIFE_LLM_API_KEY),
      baseUrl: process.env.CODELIFE_LLM_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.CODELIFE_LLM_API_KEY || '',
      model: process.env.CODELIFE_LLM_MODEL || 'deepseek-chat',
      temperature: 0.35
    };
    this.stats = {
      requestsTotal: 0,
      successTotal: 0,
      sandboxRejectedTotal: 0,
      lastLatencyMs: null,
      lastError: null,
      inFlightIds: new Set()
    };
  }

  getPublicConfig() {
    const key = this.config.apiKey || '';
    const masked =
      key.length > 8 ? `${key.slice(0, 4)}****${key.slice(-4)}` : key ? '****' : '';
    return {
      enabled: this.config.enabled,
      hasApiKey: Boolean(key),
      maskedApiKey: masked,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      temperature: this.config.temperature,
      stats: {
        requestsTotal: this.stats.requestsTotal,
        successTotal: this.stats.successTotal,
        sandboxRejectedTotal: this.stats.sandboxRejectedTotal,
        lastLatencyMs: this.stats.lastLatencyMs,
        lastError: this.stats.lastError,
        inFlightCount: this.stats.inFlightIds.size
      }
    };
  }

  updateConfig(patch = {}) {
    if (typeof patch.enabled === 'boolean') this.config.enabled = patch.enabled;
    if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) {
      this.config.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '');
    }
    if (typeof patch.apiKey === 'string') {
      const trimmed = patch.apiKey.trim();
      if (trimmed && !trimmed.includes('****')) {
        this.config.apiKey = trimmed;
      } else if (trimmed === '') {
        this.config.apiKey = '';
      }
    }
    if (typeof patch.model === 'string' && patch.model.trim()) {
      this.config.model = patch.model.trim();
    }
    if (typeof patch.temperature === 'number') {
      this.config.temperature = Math.max(0, Math.min(1, patch.temperature));
    }
    return this.getPublicConfig();
  }

  isReady() {
    return Boolean(this.config.enabled && this.config.baseUrl && this.config.model);
  }

  async testConnection() {
    if (!this.config.baseUrl || !this.config.model) {
      return { ok: false, error: '请先填写 API Base URL 与模型名称' };
    }
    const start = Date.now();
    try {
      const response = await this._chatCompletion([
        { role: 'system', content: 'You are a concise healthcheck responder.' },
        { role: 'user', content: 'Reply with exact JSON: {"ok":true}' }
      ], 60);
      const latency = Date.now() - start;
      this.stats.lastLatencyMs = latency;
      this.stats.lastError = null;
      return { ok: true, latencyMs: latency, reply: response };
    } catch (err) {
      this.stats.lastError = err.message;
      return { ok: false, error: err.message };
    }
  }

  async synthesizeGenome(organismContext) {
    if (!this.isReady()) return null;
    if (this.stats.inFlightIds.has(organismContext.id)) return null;
    if (this.stats.inFlightIds.size >= 2) return null;

    this.stats.inFlightIds.add(organismContext.id);
    this.stats.requestsTotal += 1;
    const t0 = Date.now();

    try {
      const prompt = this._buildPrompt(organismContext);
      const content = await this._chatCompletion(
        [
          {
            role: 'system',
            content:
              '你是数字生命体内的代码进化神经架构师。你必须输出严格合法的 JSON 对象（不要加 markdown 代码块外包裹以外的废话）：{"reason":"修改原因（中文简述）","hypothesis":"可验证生存假设（中文）","code":"完整的 JavaScript 源码（包含 perceive 和 decide 顶层函数）"}。源码必须遵守沙箱规则，不能包含 eval/Function/process/global/constructor/__proto__/prototype 等受限符。'
          },
          { role: 'user', content: prompt }
        ],
        1800
      );

      this.stats.lastLatencyMs = Date.now() - t0;
      const parsed = this._parseLLMResponse(content);
      if (!parsed || !parsed.code) {
        throw new Error('模型未返回有效 code 字段');
      }

      let compiled;
      try {
        compiled = compileGenome(parsed.code, { organismId: organismContext.id });
      } catch (sandboxErr) {
        this.stats.sandboxRejectedTotal += 1;
        throw new Error(`沙箱安全拦截: ${sandboxErr.message}`);
      }

      this.stats.successTotal += 1;
      this.stats.lastError = null;

      const diffPatch = createTwoFilesPatch(
        'genome_prev.js',
        'genome_llm.js',
        organismContext.code,
        parsed.code,
        '',
        '',
        { context: 3 }
      );

      return {
        source: organismContext.mentorHint ? 'LLM_MENTOR_ARCHITECT' : 'LLM_CODE_ARCHITECT',
        newCode: parsed.code,
        compiled,
        trigger: organismContext.mentorHint ? 'MENTOR_LLM_SYNTHESIS' : 'LLM_AUTONOMOUS_EVOLUTION',
        reason: parsed.reason || '大模型结合环境遥测自主重构认知与行为策略',
        hypothesis: parsed.hypothesis || '通过神经网络生成的高阶决策逻辑提升生态适应度',
        replayScore: 60,
        improvedFrames: 0,
        diffPatch,
        memeTag: null
      };
    } catch (err) {
      this.stats.lastError = err.message;
      return null;
    } finally {
      this.stats.inFlightIds.delete(organismContext.id);
    }
  }

  _buildPrompt(ctx) {
    const {
      id,
      name,
      generation,
      codeVersion,
      code,
      telemetry,
      traits,
      sensorsSnapshot,
      mentorHint
    } = ctx;
    const summary = {
      organism: `${name || id} (Gen ${generation}, v${codeVersion})`,
      traits,
      energy: sensorsSnapshot?.energy,
      hp: sensorsSnapshot?.hp,
      env: sensorsSnapshot?.env,
      visibleResourceKinds: [...new Set((sensorsSnapshot?.resources || []).map((r) => r.kind))],
      nearbyPeerCount: (sensorsSnapshot?.peers || []).length,
      damageByCause: telemetry?.damageByCause,
      avgGas: telemetry?.avgGas,
      lastError: telemetry?.lastError,
      failedCrystalSolo: telemetry?.failedCrystalSolo
    };

    return `${SANDBOX_API_SPEC}

## 当前生命体状态与因果遥测
${JSON.stringify(summary, null, 2)}

${mentorHint ? `## 创造者/导师启示\n「${mentorHint}」\n请优先围绕导师启示结合当前生态痛点改造源码。\n` : ''}
## 当前基因源码
\`\`\`javascript
${code}
\`\`\`

请针对该生命当前面临的真实生存问题或未利用生态机会，对其基因源码进行有意义的升级（保持简洁高效，避免过多循环以节省 gas）。严格返回 JSON：{"reason":"...","hypothesis":"...","code":"..."}`;
  }

  _parseLLMResponse(text) {
    const cleaned = String(text || '').trim();
    // Try direct JSON parse
    try {
      return JSON.parse(cleaned);
    } catch {
      // Extract JSON block
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // Fallback: extract JS code block
        }
      }
      const codeMatch = cleaned.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
      if (codeMatch) {
        return {
          reason: '大模型自由代码重构',
          hypothesis: '通过自定义源码结构提升环境适应能力',
          code: codeMatch[1].trim()
        };
      }
      return null;
    }
  }

  async _chatCompletion(messages, maxTokens = 1600) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          max_tokens: maxTokens
        })
      });

      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${bodyText.slice(0, 180)}`);
      }
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timer);
    }
  }
}
