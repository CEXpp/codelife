import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { WorldEngine } from './world/WorldEngine.js';
import { BIOMES, WORLD_WIDTH, WORLD_HEIGHT } from './world/WorldConfig.js';
import { LLMCodeArchitect } from './evolution/LLMCodeArchitect.js';

const PORT = Number(process.env.PORT || 8788);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const llmArchitect = new LLMCodeArchitect();
const world = new WorldEngine(llmArchitect);

// =========================================================================
// REST API Endpoints
// =========================================================================

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tick: world.tick,
    population: world.organisms.filter((o) => o.alive).length,
    lastTickDurationMs: world.lastTickDurationMs
  });
});

app.get('/api/world/summary', (_req, res) => {
  res.json({
    ok: true,
    worldConfig: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      biomes: BIOMES
    },
    frame: world.getWorldFrame(),
    snapshots: world.listSnapshots(),
    llm: llmArchitect.getPublicConfig()
  });
});

app.get('/api/world/snapshots', (_req, res) => {
  res.json({ ok: true, snapshots: world.listSnapshots() });
});

app.post('/api/world/control', (req, res) => {
  const { speedMultiplier, action, name, seedCount } = req.body || {};
  if (typeof speedMultiplier === 'number' && [0, 1, 2, 5, 12].includes(speedMultiplier)) {
    world.speedMultiplier = speedMultiplier;
  }
  if (action === 'reset') {
    world.resetWorld(typeof seedCount === 'number' ? Math.max(6, Math.min(30, seedCount)) : 18);
  } else if (action === 'saveAutosave') {
    world.saveAutosave();
  } else if (action === 'saveSnapshot') {
    const snap = world.saveSnapshot(name);
    broadcastWorldState();
    return res.json({ ok: true, snapshot: snap, snapshots: world.listSnapshots() });
  } else if (action === 'loadSnapshot') {
    try {
      world.loadSnapshot(name);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }
  broadcastWorldState();
  res.json({
    ok: true,
    frame: world.getWorldFrame(),
    snapshots: world.listSnapshots()
  });
});

app.post('/api/world/god-action', (req, res) => {
  const result = world.applyGodAction(req.body || {});
  broadcastWorldState();
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/organisms/:id', (req, res) => {
  const detail = world.getOrganismDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ ok: false, error: '未找到该数字生命或历史化石' });
  }
  res.json({ ok: true, detail });
});

app.post('/api/organisms/:id/interact', (req, res) => {
  const result = world.interactWithOrganism(req.params.id, req.body || {});
  broadcastWorldState();
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/phylogeny', (_req, res) => {
  res.json({ ok: true, ...world.getPhylogenyData() });
});

app.get('/api/llm/config', (_req, res) => {
  res.json({ ok: true, config: llmArchitect.getPublicConfig() });
});

app.post('/api/llm/config', (req, res) => {
  const updated = llmArchitect.updateConfig(req.body || {});
  res.json({ ok: true, config: updated });
});

app.post('/api/llm/test', async (_req, res) => {
  const result = await llmArchitect.testConnection();
  res.status(result.ok ? 200 : 400).json({ ...result, config: llmArchitect.getPublicConfig() });
});

// =========================================================================
// HTTP + WebSocket Server & Continuous World Simulation Loop
// =========================================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clientSelectedOrg = new Map();

wss.on('connection', (ws) => {
  clientSelectedOrg.set(ws, null);
  try {
    ws.send(JSON.stringify({ type: 'WORLD_STATE', data: world.getWorldFrame() }));
  } catch {
    // ignore closed socket
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'SELECT_ORGANISM') {
        clientSelectedOrg.set(ws, msg.id || null);
        if (msg.id) {
          const detail = world.getOrganismDetail(msg.id);
          if (detail) {
            ws.send(JSON.stringify({ type: 'SELECTED_ORGANISM_DETAIL', data: detail }));
          }
        }
      }
    } catch {
      // ignore invalid frames
    }
  });

  ws.on('close', () => {
    clientSelectedOrg.delete(ws);
  });
});

function broadcastWorldState() {
  if (wss.clients.size === 0) return;
  const framePayload = JSON.stringify({ type: 'WORLD_STATE', data: world.getWorldFrame() });
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
    try {
      ws.send(framePayload);
      const selectedId = clientSelectedOrg.get(ws);
      if (selectedId) {
        const detail = world.getOrganismDetail(selectedId);
        if (detail) {
          ws.send(JSON.stringify({ type: 'SELECTED_ORGANISM_DETAIL', data: detail }));
        }
      }
    } catch {
      // ignore socket write error
    }
  }
}

// Simulation tick driver (~80ms cycle = 12.5 frames/sec, scaling ticks per step with speedMultiplier)
let tickAccumulator = 0;
const LOOP_INTERVAL_MS = 80;

setInterval(() => {
  if (world.speedMultiplier <= 0) return;

  // Target ticks per second: 1x -> 6 tps, 2x -> 12 tps, 5x -> 25 tps, 12x -> 50 tps
  const tpsMap = { 1: 6, 2: 12, 5: 25, 12: 50 };
  const targetTps = tpsMap[world.speedMultiplier] || 6;
  tickAccumulator += (targetTps * LOOP_INTERVAL_MS) / 1000;

  let stepsThisFrame = Math.floor(tickAccumulator);
  if (stepsThisFrame > 5) stepsThisFrame = 5; // Prevent main-loop starvation
  tickAccumulator -= stepsThisFrame;

  if (stepsThisFrame > 0) {
    for (let i = 0; i < stepsThisFrame; i++) {
      world.stepTick();
    }
    broadcastWorldState();
  }
}, LOOP_INTERVAL_MS);

// Periodic autosave on graceful shutdown
process.on('SIGINT', () => {
  world.saveAutosave();
  process.exit(0);
});
process.on('SIGTERM', () => {
  world.saveAutosave();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`[CodeLife Backend] 源初盆地模拟服务已启动: http://localhost:${PORT}`);
});
