import React, { useEffect, useRef, useState } from 'react';
import type { CanvasLayers, GodTool, OrganismSummary, WorldFrame } from '../types/codelife';

interface EcosystemCanvasProps {
  frame: WorldFrame | null;
  selectedId: string | null;
  activeTool: GodTool;
  layers: CanvasLayers;
  followSelected: boolean;
  focusRequest: { x: number; y: number; seq: number } | null;
  onSelectOrganism: (id: string | null) => void;
  onGodAction: (tool: GodTool, x: number, y: number) => void;
}

const WORLD_W = 2400;
const WORLD_H = 1600;

interface RenderSmoothPos {
  x: number;
  y: number;
  angle: number;
}

export const EcosystemCanvas: React.FC<EcosystemCanvasProps> = ({
  frame,
  selectedId,
  activeTool,
  layers,
  followSelected,
  focusRequest,
  onSelectOrganism,
  onGodAction
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<WorldFrame | null>(frame);
  const selectedIdRef = useRef<string | null>(selectedId);
  const layersRef = useRef<CanvasLayers>(layers);
  const followRef = useRef<boolean>(followSelected);

  frameRef.current = frame;
  selectedIdRef.current = selectedId;
  layersRef.current = layers;
  followRef.current = followSelected;

  const camRef = useRef({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.68 });
  const smoothPosRef = useRef<Map<string, RenderSmoothPos>>(new Map());
  const godRipplesRef = useRef<{ x: number; y: number; born: number; color: string }[]>([]);
  const dragRef = useRef<{ active: boolean; moved: boolean; lastX: number; lastY: number }>({
    active: false,
    moved: false,
    lastX: 0,
    lastY: 0
  });
  const [hoverInfo, setHoverInfo] = useState<{ org: OrganismSummary; sx: number; sy: number } | null>(null);

  // Respond to external camera focus requests (e.g., clicking chronicle or phylogeny)
  useEffect(() => {
    if (!focusRequest) return;
    camRef.current.x = focusRequest.x;
    camRef.current.y = focusRequest.y;
    if (camRef.current.zoom < 0.85) camRef.current.zoom = 0.95;
  }, [focusRequest]);

  // Ambient dust particles initialized once
  const dustRef = useRef(
    Array.from({ length: 85 }, () => ({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: 0.8 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      alpha: 0.12 + Math.random() * 0.24
    }))
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const f = frameRef.current;
      const cam = camRef.current;
      const lyr = layersRef.current;

      // Update smoothed positions for 60fps fluidity
      if (f) {
        const aliveIds = new Set<string>();
        for (const org of f.organisms) {
          aliveIds.add(org.id);
          const cur = smoothPosRef.current.get(org.id);
          if (!cur) {
            smoothPosRef.current.set(org.id, { x: org.x, y: org.y, angle: org.angle });
          } else {
            cur.x += (org.x - cur.x) * 0.24;
            cur.y += (org.y - cur.y) * 0.24;
            let da = org.angle - cur.angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            cur.angle += da * 0.25;
          }
        }
        for (const k of smoothPosRef.current.keys()) {
          if (!aliveIds.has(k)) smoothPosRef.current.delete(k);
        }

        // Camera follow selected organism
        if (followRef.current && selectedIdRef.current) {
          const targetPos = smoothPosRef.current.get(selectedIdRef.current);
          if (targetPos) {
            cam.x += (targetPos.x - cam.x) * 0.12;
            cam.y += (targetPos.y - cam.y) * 0.12;
          }
        }
      }

      // Clear deep abyss backdrop
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // World boundary & subtle scientific coordinate grid
      ctx.fillStyle = '#070c19';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      // Biome atmospheric radial fields
      if (lyr.showBiomes) {
        drawBiomeGlow(ctx, 600, 400, 680, 'rgba(16, 185, 129, 0.11)'); // Meadow
        drawBiomeGlow(ctx, 1800, 400, 680, 'rgba(139, 92, 246, 0.12)'); // Canyon
        drawBiomeGlow(ctx, 600, 1200, 680, 'rgba(245, 158, 11, 0.09)'); // Swamp
        drawBiomeGlow(ctx, 1800, 1200, 680, 'rgba(6, 182, 212, 0.12)'); // Vents
      }

      // Grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.lineWidth = 1 / cam.zoom;
      for (let gx = 0; gx <= WORLD_W; gx += 120) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, WORLD_H);
        ctx.stroke();
      }
      for (let gy = 0; gy <= WORLD_H; gy += 120) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(WORLD_W, gy);
        ctx.stroke();
      }

      // Biome border & watermark labels
      if (lyr.showBiomes) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(1200, 0);
        ctx.lineTo(1200, WORLD_H);
        ctx.moveTo(0, 800);
        ctx.lineTo(WORLD_W, 800);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '600 26px "Noto Sans SC", sans-serif';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fillText('晨曦草甸 · 光合与甘露区', 44, 56);
        ctx.fillStyle = 'rgba(167, 139, 250, 0.24)';
        ctx.fillText('晶簇峡谷 · 声波协作区', 1244, 56);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
        ctx.fillText('孢子沼泽 · 化学色相试炼区', 44, 854);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.24)';
        ctx.fillText('深渊热泉 · 恒温生命绿洲', 1244, 854);
      }

      // Outer world frame border
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

      // Ambient drifting micro-plankton
      for (const d of dustRef.current) {
        d.x = (d.x + d.vx + WORLD_W) % WORLD_W;
        d.y = (d.y + d.vy + WORLD_H) % WORLD_H;
        ctx.fillStyle = `rgba(148, 226, 255, ${d.alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (f) {
        // Pheromone trails
        for (const ph of f.pheromones) {
          ctx.fillStyle =
            ph.kind === 'food'
              ? `rgba(52, 211, 153, ${ph.intensity * 0.24})`
              : `rgba(56, 189, 248, ${ph.intensity * 0.14})`;
          ctx.beginPath();
          ctx.arc(ph.x, ph.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Structures (Hot springs, Shelters, Caches)
        for (const st of f.structures) {
          drawStructure(ctx, st, now);
        }

        // Resources
        for (const r of f.resources) {
          drawResource(ctx, r, now);
        }

        // Kinship lines if enabled
        if (lyr.showKinLinks) {
          const byFamily = new Map<string, RenderSmoothPos[]>();
          for (const org of f.organisms) {
            const p = smoothPosRef.current.get(org.id);
            if (!p) continue;
            if (!byFamily.has(org.familyId)) byFamily.set(org.familyId, []);
            byFamily.get(org.familyId)!.push(p);
          }
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.16)';
          ctx.lineWidth = 1.1;
          for (const pts of byFamily.values()) {
            if (pts.length < 2) continue;
            for (let i = 0; i < pts.length - 1; i++) {
              if (Math.hypot(pts[i].x - pts[i + 1].x, pts[i].y - pts[i + 1].y) < 380) {
                ctx.beginPath();
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
                ctx.stroke();
              }
            }
          }
        }

        // Acoustic Signal Ripples
        if (lyr.showSignals) {
          for (const sig of f.signals) {
            const progress = Math.min(1, sig.age / 16);
            const r = 18 + progress * 240;
            const alpha = (1 - progress) * 0.55;
            ctx.strokeStyle =
              sig.channel === 'warn'
                ? `rgba(244, 63, 94, ${alpha})`
                : sig.channel === 'coop'
                  ? `rgba(167, 139, 250, ${alpha})`
                  : `rgba(34, 211, 238, ${alpha})`;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(sig.x, sig.y, r, 0, Math.PI * 2);
            ctx.stroke();

            if (sig.age < 10 && sig.intent) {
              ctx.font = '500 10px "JetBrains Mono", monospace';
              ctx.fillStyle = `rgba(226, 232, 240, ${alpha * 1.3})`;
              ctx.fillText(sig.intent, sig.x + 12, sig.y - 10 - progress * 20);
            }
          }

          // Cultural Meme Waves
          for (const m of f.memes) {
            const progress = Math.min(1, m.age / 24);
            const r = 20 + progress * 190;
            const alpha = (1 - progress) * 0.7;
            ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (m.age < 15) {
              ctx.font = '600 11px "JetBrains Mono", monospace';
              ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`;
              ctx.fillText(`MEME:${m.capabilityKey}`, m.x + 10, m.y - 14);
            }
          }
        }

        // Draw Organisms with AST-driven procedural morphology
        for (const org of f.organisms) {
          const pos = smoothPosRef.current.get(org.id) || { x: org.x, y: org.y, angle: org.angle };
          const isSelected = selectedIdRef.current === org.id;
          drawOrganism(ctx, org, pos, isSelected, lyr.showVision, now);
        }
      }

      // God action click ripples
      for (let i = godRipplesRef.current.length - 1; i >= 0; i--) {
        const rp = godRipplesRef.current[i];
        const age = (now - rp.born) / 900;
        if (age >= 1) {
          godRipplesRef.current.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = rp.color;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, 12 + age * 85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Screen-space weather overlay (Acid rain streaks / Cold frost)
      if (f?.weather === 'acidRain') {
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.24)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 65; i++) {
          const rx = ((i * 197 + now * 0.35) % (w + 100)) - 50;
          const ry = ((i * 313 + now * 0.9) % (h + 100)) - 50;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 8, ry + 24);
          ctx.stroke();
        }
      } else if (f?.weather === 'coldSnap') {
        const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.72);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.16)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const screenToWorld = (clientX: number, clientY: number) => {
    const cam = camRef.current;
    return {
      x: (clientX - window.innerWidth / 2) / cam.zoom + cam.x,
      y: (clientY - window.innerHeight / 2) / cam.zoom + cam.y
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, moved: false, lastX: e.clientX, lastY: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (d.active) {
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      camRef.current.x -= dx / camRef.current.zoom;
      camRef.current.y -= dy / camRef.current.zoom;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      return;
    }

    // Hover hit test
    if (!frame) return;
    const wp = screenToWorld(e.clientX, e.clientY);
    let found: OrganismSummary | null = null;
    let bestDist = 26;
    for (const org of frame.organisms) {
      const pos = smoothPosRef.current.get(org.id) || org;
      const dist = Math.hypot(pos.x - wp.x, pos.y - wp.y);
      if (dist < bestDist) {
        bestDist = dist;
        found = org;
      }
    }
    setHoverInfo(found ? { org: found, sx: e.clientX, sy: e.clientY } : null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasMoved) return;

    const wp = screenToWorld(e.clientX, e.clientY);

    if (activeTool !== 'observe') {
      godRipplesRef.current.push({
        x: wp.x,
        y: wp.y,
        born: performance.now(),
        color: activeTool === 'acidRain' ? '#a3e635' : activeTool === 'crystal' ? '#a78bfa' : '#22d3ee'
      });
      onGodAction(activeTool, wp.x, wp.y);
      return;
    }

    if (!frame) return;
    let picked: OrganismSummary | null = null;
    let best = 30;
    for (const org of frame.organisms) {
      const pos = smoothPosRef.current.get(org.id) || org;
      const dist = Math.hypot(pos.x - wp.x, pos.y - wp.y);
      if (dist < best) {
        best = dist;
        picked = org;
      }
    }
    onSelectOrganism(picked ? picked.id : null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    camRef.current.zoom = Math.max(0.32, Math.min(2.4, camRef.current.zoom * factor));
  };

  // Interactive Mini-map click
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    camRef.current.x = rx * WORLD_W;
    camRef.current.y = ry * WORLD_H;
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${activeTool === 'observe' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      />

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="fixed z-40 pointer-events-none px-2.5 py-1.5 rounded-xl glass-panel text-xs shadow-xl"
          style={{ left: hoverInfo.sx + 14, top: hoverInfo.sy - 12 }}
        >
          <div className="font-semibold text-cyan-200 flex items-center gap-1.5">
            <span>{hoverInfo.org.name}</span>
            <span className="text-[10px] font-mono text-slate-400">
              Gen-{hoverInfo.org.generation} · v{hoverInfo.org.codeVersion}
            </span>
          </div>
          <div className="text-[10px] text-slate-300 mt-0.5">{hoverInfo.org.speciesName}</div>
          <div className="text-[10px] font-mono text-emerald-300 mt-0.5">
            能量 {hoverInfo.org.energy.toFixed(0)} · 生命 {hoverInfo.org.hp.toFixed(0)} · 算力 {hoverInfo.org.lastGasUsed} gas
          </div>
        </div>
      )}

      {/* Bottom-left Minimap (visible on wider screens when sidebar doesn't cover, placed right of sidebar) */}
      <div
        onClick={handleMinimapClick}
        title="生态盆地雷达小地图（点击跳转视角）"
        className="hidden lg:block fixed bottom-4 left-[308px] z-20 w-40 h-[106px] rounded-xl glass-panel overflow-hidden cursor-pointer border border-cyan-500/25"
      >
        {/* 4 Biome Quadrants */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-30">
          <div className="bg-emerald-500/20 border-r border-b border-slate-700/50" />
          <div className="bg-violet-500/20 border-b border-slate-700/50" />
          <div className="bg-amber-500/20 border-r border-slate-700/50" />
          <div className="bg-cyan-500/20" />
        </div>
        {/* Hot springs */}
        {frame?.structures
          .filter((s) => s.kind === 'hotSpring')
          .map((s) => (
            <span
              key={s.id}
              className="absolute w-2 h-2 rounded-full bg-orange-400/70 -translate-x-1 -translate-y-1"
              style={{ left: `${(s.x / WORLD_W) * 100}%`, top: `${(s.y / WORLD_H) * 100}%` }}
            />
          ))}
        {/* Organisms */}
        {frame?.organisms.map((o) => (
          <span
            key={o.id}
            className={`absolute rounded-full -translate-x-0.5 -translate-y-0.5 ${
              selectedId === o.id ? 'w-2 h-2 bg-white ring-2 ring-cyan-400 z-10' : 'w-1 h-1'
            }`}
            style={{
              left: `${(o.x / WORLD_W) * 100}%`,
              top: `${(o.y / WORLD_H) * 100}%`,
              backgroundColor: selectedId === o.id ? '#fff' : `hsl(${o.phenotype.primaryHue}, 85%, 65%)`
            }}
          />
        ))}
      </div>
    </div>
  );
};

// =========================================================================
// Procedural Canvas Drawing Helpers
// =========================================================================

function drawBiomeGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 20, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(5, 8, 17, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStructure(ctx: CanvasRenderingContext2D, st: WorldFrame['structures'][0], now: number) {
  if (st.kind === 'hotSpring') {
    const pulse = 1 + Math.sin(now * 0.002 + st.x) * 0.05;
    const grad = ctx.createRadialGradient(st.x, st.y, 10, st.x, st.y, st.radius * pulse);
    grad.addColorStop(0, 'rgba(251, 146, 60, 0.35)');
    grad.addColorStop(0.55, 'rgba(34, 211, 238, 0.14)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Inner vent ring
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(st.x, st.y, 16, 0, Math.PI * 2);
    ctx.stroke();
  } else if (st.kind === 'shelter') {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (st.kind === 'cache') {
    ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = st.x + Math.cos(a) * 14;
      const py = st.y + Math.sin(a) * 14;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawResource(ctx: CanvasRenderingContext2D, r: WorldFrame['resources'][0], now: number) {
  const bob = Math.sin(now * 0.004 + r.x) * 1.5;
  if (r.kind === 'nectar') {
    ctx.fillStyle = 'rgba(52, 211, 153, 0.85)';
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(r.x, r.y + bob, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (r.kind === 'spore') {
    ctx.fillStyle = `hsla(${r.hue}, 88%, 62%, 0.88)`;
    ctx.beginPath();
    ctx.arc(r.x, r.y + bob, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `hsla(${r.hue}, 95%, 78%, 0.45)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(r.x, r.y + bob, 8.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (r.kind === 'crystal') {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(now * 0.0008 + r.x);
    ctx.fillStyle = 'rgba(167, 139, 250, 0.85)';
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const rad = i % 2 === 0 ? 10 : 5.5;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    // detritus
    ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.fillRect(r.x - 3, r.y - 3, 6, 6);
  }
}

function drawOrganism(
  ctx: CanvasRenderingContext2D,
  org: OrganismSummary,
  pos: RenderSmoothPos,
  isSelected: boolean,
  showVision: boolean,
  now: number
) {
  const ph = org.phenotype;
  const r = ph.baseRadius;
  const mainColor = `hsl(${ph.primaryHue}, 85%, 60%)`;
  const glowColor = `hsla(${ph.primaryHue}, 92%, 65%, 0.35)`;
  const secColor = `hsl(${ph.secondaryHue}, 88%, 68%)`;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  // Vision circle for selected organism
  if (isSelected && showVision) {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 230, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Selection reticle
  if (isSelected) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 11 + Math.sin(now * 0.008) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Self-programming live DNA double-helix orbital effect
  if (org.codeMutatingEffectTicks > 0) {
    const rot = now * 0.009;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 15, rot, rot + Math.PI * 0.8);
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, r + 15, rot + Math.PI, rot + Math.PI * 1.8);
    ctx.stroke();
  }

  // Toxin filter dashed ring (evolved hasToxinMemory)
  if (ph.toxinFilterRing > 0) {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Cooperative crystal orbiting geometry (evolved hasCoopCrystal)
  if (ph.crystalHalo > 0) {
    const orbAngle = now * 0.003;
    for (let i = 0; i < 3; i++) {
      const a = orbAngle + (i * Math.PI * 2) / 3;
      const ox = Math.cos(a) * (r + 7);
      const oy = Math.sin(a) * (r + 7);
      ctx.fillStyle = 'rgba(196, 181, 253, 0.9)';
      ctx.beginPath();
      ctx.arc(ox, oy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.rotate(pos.angle);

  // Chlorophyll photosynthetic wings (evolved hasPhotosynthesis)
  if (ph.wingSize > 0) {
    const flap = Math.sin(now * 0.007 + pos.x) * 0.25;
    ctx.fillStyle = 'rgba(52, 211, 153, 0.34)';
    ctx.strokeStyle = 'rgba(110, 231, 183, 0.65)';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(1, side);
      ctx.rotate(flap);
      ctx.beginPath();
      ctx.ellipse(-2, r * 0.85, r * 0.85, r * 0.42, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Undulating cilia tail
  const tailSwing = Math.sin(now * 0.012 + pos.x * 0.05) * 5;
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0);
  ctx.quadraticCurveTo(-r * 1.4, tailSwing, -r * 1.9, -tailSwing * 0.6);
  ctx.stroke();

  // Sensory antennae (evolved signal / meme modules)
  if (ph.antennaCount > 0) {
    const count = Math.min(3, ph.antennaCount);
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.42;
      const ax = Math.cos(spread) * (r + 8);
      const ay = Math.sin(spread) * (r + 8);
      ctx.strokeStyle = secColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(spread) * r * 0.7, Math.sin(spread) * r * 0.7);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = secColor;
      ctx.beginPath();
      ctx.arc(ax, ay, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Predation / Defense spikes
  if (ph.spikeLevel > 0) {
    ctx.fillStyle = org.isAttacking ? '#fb7185' : '#f43f5e';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.8, side * 3);
      ctx.lineTo(r + 6 * ph.spikeLevel, side * 6);
      ctx.lineTo(r * 0.5, side * 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Cell outer glow + translucent membrane
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14;
  ctx.fillStyle = `hsla(${ph.primaryHue}, 82%, 48%, 0.45)`;
  ctx.strokeStyle = org.isDefending ? '#38bdf8' : mainColor;
  ctx.lineWidth = org.isDefending ? 3 : 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Neural nucleus pulsing proportionally to AST gas usage
  const gasNorm = Math.min(1, (org.lastGasUsed || 15) / 140);
  const nucPulse = 0.75 + Math.sin(now * (0.008 + gasNorm * 0.02)) * 0.25;
  ctx.fillStyle = secColor;
  ctx.beginPath();
  ctx.arc(r * 0.16, 0, Math.max(2.5, r * 0.34 * nucPulse), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Adopted Companion Crown & Name tag
  if (org.isAdopted || isSelected) {
    ctx.font = '600 11px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    const label = `${org.isAdopted ? '★ ' : ''}${org.name}`;
    ctx.fillStyle = org.isAdopted ? '#fde047' : '#e2e8f0';
    ctx.fillText(label, pos.x, pos.y - r - 12);
    ctx.textAlign = 'left';
  }
}
