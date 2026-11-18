import type {
  BiomeConfig,
  LLMConfigState,
  OrganismDetail,
  PhylogenyResponse,
  WorldFrame
} from '../types/codelife';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export interface WorldSummaryResponse {
  ok: true;
  worldConfig: {
    width: number;
    height: number;
    biomes: Record<string, BiomeConfig>;
  };
  frame: WorldFrame;
  snapshots: { name: string; updatedAt: string; sizeKb: number }[];
  llm: LLMConfigState;
}

export const api = {
  getWorldSummary: () => request<WorldSummaryResponse>('/api/world/summary'),

  controlWorld: (body: {
    speedMultiplier?: number;
    action?: 'reset' | 'saveAutosave' | 'saveSnapshot' | 'loadSnapshot';
    name?: string;
    seedCount?: number;
  }) =>
    request<{ ok: true; frame: WorldFrame; snapshots: { name: string; updatedAt: string; sizeKb: number }[] }>(
      '/api/world/control',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  godAction: (kind: string, x: number, y: number) =>
    request<{ ok: true; message?: string }>('/api/world/god-action', {
      method: 'POST',
      body: JSON.stringify({ kind, x, y })
    }),

  getOrganismDetail: (id: string) =>
    request<{ ok: true; detail: OrganismDetail }>(`/api/organisms/${encodeURIComponent(id)}`),

  interactOrganism: (
    id: string,
    body: {
      action: 'adopt' | 'rename' | 'feed' | 'heal' | 'evolve' | 'patchCode';
      name?: string;
      mentorHint?: string;
      customCode?: string;
      reason?: string;
      hypothesis?: string;
    }
  ) =>
    request<{ ok: true; detail: OrganismDetail; commit?: unknown }>(
      `/api/organisms/${encodeURIComponent(id)}/interact`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getPhylogeny: () => request<{ ok: true } & PhylogenyResponse>('/api/phylogeny'),

  getLLMConfig: () => request<{ ok: true; config: LLMConfigState }>('/api/llm/config'),

  updateLLMConfig: (patch: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
  }) =>
    request<{ ok: true; config: LLMConfigState }>('/api/llm/config', {
      method: 'POST',
      body: JSON.stringify(patch)
    }),

  testLLMConnection: () =>
    request<{ ok: boolean; latencyMs?: number; error?: string; config: LLMConfigState }>(
      '/api/llm/test',
      { method: 'POST' }
    )
};
