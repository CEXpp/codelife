import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './services/api';
import type {
  CanvasLayers,
  GodTool,
  LLMConfigState,
  OrganismDetail,
  WorldFrame
} from './types/codelife';
import { TopObservatoryBar } from './components/TopObservatoryBar';
import { EcosystemCanvas } from './components/EcosystemCanvas';
import { CreatorDock } from './components/CreatorDock';
import { ChronicleSidebar } from './components/ChronicleSidebar';
import { OrganismInspector } from './components/OrganismInspector';
import { PhylogenyModal } from './components/PhylogenyModal';
import { LLMConfigModal } from './components/LLMConfigModal';

export function App() {
  const [frame, setFrame] = useState<WorldFrame | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<OrganismDetail | null>(null);
  const [activeTool, setActiveTool] = useState<GodTool>('observe');
  const [followSelected, setFollowSelected] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ x: number; y: number; seq: number } | null>(null);
  const [layers, setLayers] = useState<CanvasLayers>({
    showBiomes: true,
    showVision: true,
    showSignals: true,
    showKinLinks: false
  });
  const [snapshots, setSnapshots] = useState<{ name: string; updatedAt: string; sizeKb: number }[]>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfigState | null>(null);
  const [phylogenyOpen, setPhylogenyOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 2800);
  }, []);

  // Load initial world summary
  useEffect(() => {
    api
      .getWorldSummary()
      .then((res) => {
        setFrame(res.frame);
        setSnapshots(res.snapshots);
        setLlmConfig(res.llm);
        const firstPartner = res.frame.organisms.find((o) => o.isAdopted) || res.frame.organisms[0];
        if (firstPartner) {
          setSelectedId(firstPartner.id);
        }
      })
      .catch((err) => showToast(`连接后端失败: ${err.message}`));
  }, [showToast]);

  // Auto-reconnecting WebSocket telemetry stream
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (selectedIdRef.current) {
          ws.send(JSON.stringify({ type: 'SELECT_ORGANISM', id: selectedIdRef.current }));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'WORLD_STATE') {
            setFrame(msg.data);
          } else if (msg.type === 'SELECTED_ORGANISM_DETAIL') {
            if (msg.data?.id === selectedIdRef.current) {
              setSelectedDetail(msg.data);
            }
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // Sync selected organism subscription & fetch fossil/live detail immediately
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SELECT_ORGANISM', id: selectedId }));
    }
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    api
      .getOrganismDetail(selectedId)
      .then((res) => {
        setSelectedDetail(res.detail);
        if (res.detail.alive) {
          setFocusRequest({ x: res.detail.x, y: res.detail.y, seq: Date.now() });
        }
      })
      .catch(() => setSelectedDetail(null));
  }, [selectedId]);

  const handleSetSpeed = useCallback(
    async (speedMultiplier: number) => {
      try {
        const res = await api.controlWorld({ speedMultiplier });
        setFrame(res.frame);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
    },
    [showToast]
  );

  // Spacebar pause/resume shortcut (when not typing in inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        const nextSpeed = (frame?.speedMultiplier ?? 1) === 0 ? 1 : 0;
        handleSetSpeed(nextSpeed);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frame?.speedMultiplier, handleSetSpeed]);

  const handleResetWorld = async () => {
    const res = await api.controlWorld({ action: 'reset', seedCount: 18 });
    setFrame(res.frame);
    setSelectedId(res.frame.organisms[0]?.id || null);
    showToast('源初盆地已重新创世');
  };

  const handleSaveSnapshot = async (name: string) => {
    const res = await api.controlWorld({ action: 'saveSnapshot', name });
    setSnapshots(res.snapshots);
    showToast(`已保存世界快照「${name}」`);
  };

  const handleLoadSnapshot = async (name: string) => {
    const res = await api.controlWorld({ action: 'loadSnapshot', name });
    setFrame(res.frame);
    setSelectedId(res.frame.organisms[0]?.id || null);
    showToast(`已恢复时间线快照「${name}」`);
  };

  const handleGodAction = async (tool: GodTool, x: number, y: number) => {
    try {
      const res = await api.godAction(tool, x, y);
      if (res.message) showToast(res.message);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSelectFromDockOrTool = (tool: GodTool) => {
    if (tool === 'acidRain' || tool === 'coldSnap') {
      handleGodAction(tool, 1200, 800);
      return;
    }
    setActiveTool(tool);
  };

  const handleInteractOrganism = async (
    id: string,
    payload: Parameters<typeof api.interactOrganism>[1]
  ) => {
    const res = await api.interactOrganism(id, payload);
    setSelectedDetail(res.detail);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050811] text-slate-100">
      <EcosystemCanvas
        frame={frame}
        selectedId={selectedId}
        activeTool={activeTool}
        layers={layers}
        followSelected={followSelected}
        focusRequest={focusRequest}
        onSelectOrganism={(id) => setSelectedId(id)}
        onGodAction={handleGodAction}
      />

      <TopObservatoryBar
        frame={frame}
        wsConnected={wsConnected}
        llmConfig={llmConfig}
        snapshots={snapshots}
        onSetSpeed={handleSetSpeed}
        onResetWorld={handleResetWorld}
        onSaveSnapshot={handleSaveSnapshot}
        onLoadSnapshot={handleLoadSnapshot}
        onOpenPhylogeny={() => setPhylogenyOpen(true)}
        onOpenLLMModal={() => setLlmOpen(true)}
      />

      <ChronicleSidebar
        organisms={frame?.organisms || []}
        events={frame?.chronicleEvents || []}
        selectedId={selectedId}
        onSelectOrganism={(id) => setSelectedId(id)}
      />

      <OrganismInspector
        detail={selectedDetail}
        onClose={() => setSelectedId(null)}
        onSelectOrganism={(id) => setSelectedId(id)}
        onOpenPhylogeny={() => setPhylogenyOpen(true)}
        onInteract={handleInteractOrganism}
      />

      <CreatorDock
        activeTool={activeTool}
        onSelectTool={handleSelectFromDockOrTool}
        layers={layers}
        onToggleLayer={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
        followSelected={followSelected}
        onToggleFollow={() => setFollowSelected((f) => !f)}
      />

      <PhylogenyModal
        open={phylogenyOpen}
        onClose={() => setPhylogenyOpen(false)}
        onSelectNode={(id) => setSelectedId(id)}
      />

      <LLMConfigModal
        open={llmOpen}
        onClose={() => setLlmOpen(false)}
        config={llmConfig}
        onUpdated={(cfg) => setLlmConfig(cfg)}
      />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl glass-panel border-cyan-400/50 text-xs font-medium text-cyan-100 shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
