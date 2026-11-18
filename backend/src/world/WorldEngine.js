import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SEASONS,
  SEASON_TICKS,
  BIOMES,
  WORLD_LIMITS,
  getBiomeAt,
  isHueToxic
} from './WorldConfig.js';
import { Organism } from './Organism.js';
import { GENESIS_GENOME_CODE } from '../evolution/GenesisGenomes.js';
import { synthesizeSelfModification } from '../evolution/SymbolicASTSynthesizer.js';
import { createAsexualOffspringGenome, createSexualOffspringGenome } from '../evolution/CrossoverEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const AUTOSAVE_PATH = path.join(DATA_DIR, 'world_autosave.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

export class WorldEngine {
  constructor(llmArchitect, options = {}) {
    this.llmArchitect = llmArchitect;
    this.rng = options.rng || Math.random;
    this.disableDiskPersistence = Boolean(options.disableDiskPersistence);

    this.tick = 0;
    this.epoch = 1;
    this.speedMultiplier = 1; // 0 = paused, 1, 2, 5, 12
    this.running = true;

    this.season = 'spring';
    this.weather = 'clear';
    this.weatherTicksRemaining = 180;
    this.pressureDrop = false;
    this.baseTemperature = 20;
    this.sunlight = 0.8;

    // Hidden chemical law: spore hues within these ranges are toxic
    this.toxicHueCenters = [25, 295];

    this.nextSeqId = 1;
    this.organisms = [];
    this.resources = [];
    this.structures = [];
    this.activeSignals = [];
    this.activeMemes = [];
    this.pheromones = [];
    this.chronicleEvents = [];
    this.lineageArchive = new Map();
    this.culturalRegistry = new Map();
    this.historySeries = [];
    this.totalCommits = 0;
    this.lastTickDurationMs = 0;

    if (!this.disableDiskPersistence) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }

    if (!this.disableDiskPersistence && fs.existsSync(AUTOSAVE_PATH)) {
      try {
        this.loadFromFile(AUTOSAVE_PATH);
        return;
      } catch (err) {
        console.error('[WorldEngine] 自动存档加载失败，重建创世世界:', err.message);
      }
    }

    this.resetWorld();
  }

  _genId(prefix) {
    const id = `${prefix}_${this.nextSeqId}`;
    this.nextSeqId += 1;
    return id;
  }

  resetWorld(seedCount = 18) {
    this.tick = 0;
    this.epoch = 1;
    this.season = 'spring';
    this.weather = 'clear';
    this.weatherTicksRemaining = 140;
    this.pressureDrop = false;
    this.baseTemperature = 21;
    this.sunlight = 0.85;
    this.toxicHueCenters = [22, 300];
    this.nextSeqId = 1;
    this.organisms = [];
    this.resources = [];
    this.structures = [];
    this.activeSignals = [];
    this.activeMemes = [];
    this.pheromones = [];
    this.chronicleEvents = [];
    this.lineageArchive.clear();
    this.culturalRegistry.clear();
    this.historySeries = [];
    this.totalCommits = 0;

    // Permanent geological hot springs (vital in winter & harsh storms)
    const springs = [
      { x: 1680, y: 1220 },
      { x: 2050, y: 1020 },
      { x: 1450, y: 1410 },
      { x: 760, y: 420 }
    ];
    for (const s of springs) {
      this.structures.push({
        id: this._genId('str'),
        kind: 'hotSpring',
        x: s.x,
        y: s.y,
        radius: 125,
        ownerId: 'world',
        storedEnergy: 0,
        ttl: Infinity
      });
    }

    // Seed diverse initial resources across the 4 ecological niches
    for (let i = 0; i < 62; i++) this._spawnNaturalResource('nectar');
    for (let i = 0; i < 24; i++) this._spawnNaturalResource('spore');
    for (let i = 0; i < 14; i++) this._spawnNaturalResource('crystal');

    // Spawn Gen-0 founding organisms
    for (let i = 0; i < seedCount; i++) {
      const x = 140 + this.rng() * (WORLD_WIDTH - 280);
      const y = 140 + this.rng() * (WORLD_HEIGHT - 280);
      this.spawnGenesisOrganism(x, y, i === 0);
    }

    this._addChronicle('GENESIS', `源初盆地创世完成：投放 ${seedCount} 只原初生命 (Gen-0)，仅携带基础觅食与游动源码`, null);
    this._sampleHistory();
    if (!this.disableDiskPersistence) this.saveAutosave();
  }

  spawnGenesisOrganism(x, y, adoptFirst = false) {
    if (this.organisms.length >= WORLD_LIMITS.maxPopulation) return null;
    const id = this._genId('org');
    const org = new Organism({
      id,
      generation: 0,
      birthTick: this.tick,
      x: Math.max(40, Math.min(WORLD_WIDTH - 40, x)),
      y: Math.max(40, Math.min(WORLD_HEIGHT - 40, y)),
      code: GENESIS_GENOME_CODE,
      isAdopted: adoptFirst,
      rng: this.rng
    });
    this.organisms.push(org);
    this.totalCommits += 1;
    this._archiveOrganism(org);
    return org;
  }

  _spawnNaturalResource(kind, overrideX = null, overrideY = null) {
    if (this.resources.length >= WORLD_LIMITS.maxResources) return null;
    let x = overrideX;
    let y = overrideY;
    if (x === null || y === null) {
      if (kind === 'nectar') {
        const inMeadow = this.rng() < 0.58;
        x = inMeadow ? 70 + this.rng() * 1100 : 70 + this.rng() * (WORLD_WIDTH - 140);
        y = inMeadow ? 70 + this.rng() * 720 : 70 + this.rng() * (WORLD_HEIGHT - 140);
      } else if (kind === 'crystal') {
        const inCanyon = this.rng() < 0.78;
        x = inCanyon ? 1240 + this.rng() * 1080 : 120 + this.rng() * (WORLD_WIDTH - 240);
        y = inCanyon ? 70 + this.rng() * 700 : 80 + this.rng() * (WORLD_HEIGHT - 160);
      } else if (kind === 'spore') {
        const inSwamp = this.rng() < 0.8;
        x = inSwamp ? 70 + this.rng() * 1080 : 90 + this.rng() * (WORLD_WIDTH - 180);
        y = inSwamp ? 840 + this.rng() * 680 : 90 + this.rng() * (WORLD_HEIGHT - 180);
      } else {
        x = 90 + this.rng() * (WORLD_WIDTH - 180);
        y = 90 + this.rng() * (WORLD_HEIGHT - 180);
      }
    }

    const hue = kind === 'spore' ? Math.floor(this.rng() * 360) : kind === 'crystal' ? 270 : 155;
    const energyValue =
      kind === 'crystal' ? 64 : kind === 'spore' ? 38 : kind === 'detritus' ? 30 : 34;

    const item = {
      id: this._genId('res'),
      kind,
      x: Math.max(24, Math.min(WORLD_WIDTH - 24, x)),
      y: Math.max(24, Math.min(WORLD_HEIGHT - 24, y)),
      energyValue,
      hue,
      requiresCoop: kind === 'crystal',
      age: 0,
      ttl: kind === 'detritus' ? 420 : kind === 'crystal' ? 950 : 680
    };
    this.resources.push(item);
    return item;
  }

  _addChronicle(kind, text, organismId = null, extra = {}) {
    this.chronicleEvents.unshift({
      id: this._genId('evt'),
      tick: this.tick,
      kind,
      text,
      organismId,
      ...extra
    });
    if (this.chronicleEvents.length > WORLD_LIMITS.maxChronicleEvents) {
      this.chronicleEvents.length = WORLD_LIMITS.maxChronicleEvents;
    }
  }

  _archiveOrganism(org) {
    const detail = org.toDetailedInspect();
    const trimmedCommits = (detail.codeCommits || []).slice(-15).map((c, idx, arr) =>
      idx === arr.length - 1 ? c : { ...c, codeSnapshot: '' }
    );
    detail.codeCommits = trimmedCommits;
    this.lineageArchive.set(org.id, detail);
    if (this.lineageArchive.size > WORLD_LIMITS.maxLineageArchive) {
      // Prune oldest non-adopted dead fossils with no children
      for (const [k, rec] of this.lineageArchive.entries()) {
        if (!rec.alive && !rec.isAdopted && (rec.childrenIds?.length || 0) === 0) {
          this.lineageArchive.delete(k);
          if (this.lineageArchive.size <= WORLD_LIMITS.maxLineageArchive) break;
        }
      }
    }
  }

  _updateClimateAndEcology() {
    const yearTick = this.tick % (SEASON_TICKS * 4);
    const seasonIdx = Math.floor(yearTick / SEASON_TICKS);
    const nextSeason = SEASONS[seasonIdx];
    if (nextSeason !== this.season) {
      this.season = nextSeason;
      if (nextSeason === 'spring') this.epoch += 1;
      const seasonNames = { spring: '春之复苏', summer: '盛夏光年', autumn: '秋日蓄能', winter: '寒冬冰期' };
      this._addChronicle('CLIMATE', `气候进入【${seasonNames[nextSeason]}】（第 ${this.epoch} 纪元）`);
    }

    const seasonBaseTemp = { spring: 20, summer: 31, autumn: 13, winter: -4 }[this.season];
    const diurnal = Math.sin((this.tick % 240) / 240 * Math.PI * 2); // -1..1
    this.sunlight = Number(
      Math.max(
        0.08,
        Math.min(1, (this.season === 'summer' ? 0.72 : this.season === 'winter' ? 0.35 : 0.56) + diurnal * 0.32)
      ).toFixed(2)
    );
    this.baseTemperature = Number((seasonBaseTemp + diurnal * 4.5).toFixed(1));

    this.weatherTicksRemaining -= 1;
    this.pressureDrop = this.weatherTicksRemaining <= 24 && this.weather === 'clear';

    if (this.weatherTicksRemaining <= 0) {
      const r = this.rng();
      if (this.weather !== 'clear') {
        this.weather = 'clear';
        this.weatherTicksRemaining = 120 + Math.floor(this.rng() * 140);
      } else if (this.season === 'winter' && r < 0.48) {
        this.weather = 'coldSnap';
        this.weatherTicksRemaining = 75;
        this._addChronicle('WEATHER', '极寒骤降：热泉与庇护所外代谢剧增！');
      } else if (r < 0.32) {
        this.weather = 'acidRain';
        this.weatherTicksRemaining = 65;
        this._addChronicle('WEATHER', '酸雨风暴袭来：暴露在庇护所外的生命将持续受损！');
      } else if (r < 0.52) {
        this.weather = 'meteor';
        this.weatherTicksRemaining = 55;
        for (let k = 0; k < 5; k++) this._spawnNaturalResource('crystal');
        this._addChronicle('WEATHER', '星晶流星雨降临：源初盆地散落多枚共鸣晶簇');
      } else {
        this.weather = 'breeze';
        this.weatherTicksRemaining = 95;
      }
    }

    // Regenerate ecosystem resources smoothly
    const nectarTarget = this.season === 'winter' ? 28 : this.season === 'summer' ? 68 : 56;
    const nectarCount = this.resources.filter((r) => r.kind === 'nectar').length;
    if (nectarCount < nectarTarget && this.tick % 3 === 0) {
      this._spawnNaturalResource('nectar');
    }
    const sporeCount = this.resources.filter((r) => r.kind === 'spore').length;
    if (sporeCount < 24 && this.tick % 9 === 0) {
      this._spawnNaturalResource('spore');
    }
    const crystalCount = this.resources.filter((r) => r.kind === 'crystal').length;
    if (crystalCount < 16 && this.tick % 16 === 0) {
      this._spawnNaturalResource('crystal');
    }

    // Age & expire resources/structures/signals/memes/pheromones
    for (let i = this.resources.length - 1; i >= 0; i--) {
      this.resources[i].age += 1;
      if (this.resources[i].age >= this.resources[i].ttl) {
        this.resources.splice(i, 1);
      }
    }
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (Number.isFinite(s.ttl)) {
        s.ttl -= 1;
        if (s.ttl <= 0) this.structures.splice(i, 1);
      }
    }
    for (let i = this.activeSignals.length - 1; i >= 0; i--) {
      this.activeSignals[i].age += 1;
      if (this.activeSignals[i].age > 16) this.activeSignals.splice(i, 1);
    }
    for (let i = this.activeMemes.length - 1; i >= 0; i--) {
      this.activeMemes[i].age += 1;
      if (this.activeMemes[i].age > 24) this.activeMemes.splice(i, 1);
    }
    for (let i = this.pheromones.length - 1; i >= 0; i--) {
      this.pheromones[i].intensity -= 0.012;
      if (this.pheromones[i].intensity <= 0.05) this.pheromones.splice(i, 1);
    }
  }

  _buildSensorsFor(org) {
    const biomeId = getBiomeAt(org.x, org.y);
    const biome = BIOMES[biomeId];
    const localSun = Number(Math.max(0.05, Math.min(1, this.sunlight + biome.sunBonus)).toFixed(2));
    let localTemp = this.baseTemperature + biome.tempOffset + (this.weather === 'coldSnap' ? -10 : 0);

    let inShelter = false;
    let nearHotSpring = false;
    const nearStructures = [];

    for (const st of this.structures) {
      const d = Math.hypot(st.x - org.x, st.y - org.y);
      if (st.kind === 'hotSpring' && d <= st.radius) {
        nearHotSpring = true;
        localTemp += 18;
      }
      if (st.kind === 'shelter' && d <= st.radius) {
        inShelter = true;
        localTemp += 9;
      }
      if (d <= WORLD_LIMITS.visionRadius * 1.45) {
        nearStructures.push({
          id: st.id,
          kind: st.kind,
          x: Math.round(st.x),
          y: Math.round(st.y),
          dist: Number(d.toFixed(1)),
          ownerId: st.ownerId,
          storedEnergy: Number((st.storedEnergy || 0).toFixed(1)),
          radius: st.radius
        });
      }
    }
    nearStructures.sort((a, b) => a.dist - b.dist);

    const nearResources = [];
    for (const r of this.resources) {
      const d = Math.hypot(r.x - org.x, r.y - org.y);
      if (d <= WORLD_LIMITS.visionRadius) {
        nearResources.push({
          id: r.id,
          kind: r.kind,
          x: Math.round(r.x),
          y: Math.round(r.y),
          dist: Number(d.toFixed(1)),
          energyValue: r.energyValue,
          hue: r.hue,
          requiresCoop: r.requiresCoop
        });
      }
    }
    nearResources.sort((a, b) => a.dist - b.dist);

    const nearPeers = [];
    for (const other of this.organisms) {
      if (!other.alive || other.id === org.id) continue;
      const d = Math.hypot(other.x - org.x, other.y - org.y);
      if (d <= WORLD_LIMITS.visionRadius) {
        let kinship = 0;
        if (other.familyId === org.familyId) kinship = 0.65;
        if (org.parentIds.includes(other.id) || other.parentIds.includes(org.id)) kinship = 1.0;
        else if (other.phenotypeInfo.speciesSignature === org.phenotypeInfo.speciesSignature) kinship = Math.max(kinship, 0.35);

        nearPeers.push({
          id: other.id,
          x: Math.round(other.x),
          y: Math.round(other.y),
          dist: Number(d.toFixed(1)),
          energy: Number(other.energy.toFixed(1)),
          hp: Number(other.hp.toFixed(1)),
          kinship,
          generation: other.generation,
          speciesSignature: other.phenotypeInfo.speciesSignature,
          isAttacking: other.isAttacking,
          lastActionType: other.lastAction?.type || 'rest'
        });
      }
    }
    nearPeers.sort((a, b) => a.dist - b.dist);

    const sigRadius = biomeId === 'canyon' ? WORLD_LIMITS.signalRadius * 1.2 : WORLD_LIMITS.signalRadius;
    const heardSignals = [];
    for (const sig of this.activeSignals) {
      if (sig.fromId === org.id) continue;
      const d = Math.hypot(sig.x - org.x, sig.y - org.y);
      if (d <= sigRadius) {
        heardSignals.push({
          fromId: sig.fromId,
          channel: sig.channel,
          intent: sig.intent,
          x: sig.x,
          y: sig.y,
          hue: sig.hue,
          targetId: sig.targetId,
          dist: Number(d.toFixed(1)),
          age: sig.age
        });
      }
    }

    const heardMemes = [];
    for (const m of this.activeMemes) {
      if (m.fromId === org.id) continue;
      const d = Math.hypot(m.x - org.x, m.y - org.y);
      if (d <= WORLD_LIMITS.memeRadius) {
        heardMemes.push({
          id: m.id,
          fromId: m.fromId,
          speciesName: m.speciesName,
          capabilityKey: m.capabilityKey,
          fitnessScore: m.fitnessScore
        });
      }
    }

    const nearPheromones = [];
    for (const ph of this.pheromones) {
      const d = Math.hypot(ph.x - org.x, ph.y - org.y);
      if (d <= 150) {
        nearPheromones.push({
          kind: ph.kind,
          x: ph.x,
          y: ph.y,
          dist: Number(d.toFixed(1)),
          intensity: Number(ph.intensity.toFixed(2))
        });
      }
    }

    return {
      tick: this.tick,
      x: Number(org.x.toFixed(1)),
      y: Number(org.y.toFixed(1)),
      energy: Number(org.energy.toFixed(1)),
      maxEnergy: org.maxEnergy,
      hp: Number(org.hp.toFixed(1)),
      maxHp: org.maxHp,
      age: org.age,
      self: {
        id: org.id,
        x: Number(org.x.toFixed(1)),
        y: Number(org.y.toFixed(1)),
        angle: Number(org.angle.toFixed(3)),
        energy: Number(org.energy.toFixed(1)),
        hp: Number(org.hp.toFixed(1)),
        generation: org.generation,
        speciesSignature: org.phenotypeInfo.speciesSignature,
        familyId: org.familyId,
        lastDamageCause: org.lastDamageCause,
        lastDamageAmount: org.lastDamageAmount
      },
      env: {
        biome: biomeId,
        season: this.season,
        weather: this.weather,
        pressureDrop: this.pressureDrop,
        temperature: Number(localTemp.toFixed(1)),
        sunlight: localSun,
        inShelter,
        nearHotSpring
      },
      resources: nearResources.slice(0, 10),
      peers: nearPeers.slice(0, 8),
      structures: nearStructures.slice(0, 6),
      signals: heardSignals.slice(0, 6),
      memes: heardMemes.slice(0, 4),
      pheromones: nearPheromones.slice(0, 6)
    };
  }

  stepTick() {
    const tStart = performance.now();
    this.tick += 1;
    this._updateClimateAndEcology();

    // Auto-reseed if ecosystem suffered total extinction (keeps living world persistent)
    const aliveCount = this.organisms.filter((o) => o.alive).length;
    if (aliveCount === 0) {
      this._addChronicle('EXTINCTION', `第 ${this.epoch} 纪元发生生态大灭绝，深渊热泉重新孕育新一代原初孢子`);
      for (let i = 0; i < 12; i++) {
        this.spawnGenesisOrganism(1400 + this.rng() * 750, 950 + this.rng() * 500, i === 0);
      }
    } else if (aliveCount < WORLD_LIMITS.minAutoSeedPopulation && this.tick % 40 === 0) {
      this.spawnGenesisOrganism(200 + this.rng() * (WORLD_WIDTH - 400), 200 + this.rng() * (WORLD_HEIGHT - 400));
    }

    const resMap = new Map(this.resources.map((r) => [r.id, r]));
    const strMap = new Map(this.structures.map((s) => [s.id, s]));
    const orgMap = new Map(this.organisms.map((o) => [o.id, o]));

    const pendingActions = [];
    const sensorsByOrg = new Map();

    // Phase 1: Sensor perception & isolated Sandbox VM execution
    for (const org of this.organisms) {
      if (!org.alive) continue;
      org.age += 1;
      org.isAttacking = false;
      org.isDefending = false;

      const sensors = this._buildSensorsFor(org);
      sensorsByOrg.set(org.id, sensors);

      // Clear per-tick damage notice after organism gets to inspect it
      org.lastDamageCause = null;
      org.lastDamageAmount = 0;

      const stepRes = org.stepMind(sensors, this.rng);
      if (stepRes) {
        pendingActions.push({ org, sensors, action: stepRes.action, gasUsed: stepRes.gasUsed });
      }
    }

    // Track cooperative crystal harvesting intents
    const crystalCoopActors = new Map(); // crystalId -> [org, ...]
    for (const item of pendingActions) {
      if (item.action.type === 'cooperateHarvest' && item.action.targetId) {
        const res = resMap.get(item.action.targetId);
        if (res && res.kind === 'crystal') {
          const d = Math.hypot(res.x - item.org.x, res.y - item.org.y);
          if (d <= WORLD_LIMITS.coopRadius) {
            if (!crystalCoopActors.has(res.id)) crystalCoopActors.set(res.id, []);
            crystalCoopActors.get(res.id).push(item.org);
          }
        }
      }
    }

    const newOffspring = [];

    // Phase 2: Resolve physical movement, interactions, resource & climate effects
    for (const { org, sensors, action, gasUsed } of pendingActions) {
      if (!org.alive) continue;

      let speed = action.speed ?? 0;
      let moveAngle = action.angle ?? org.angle;

      // Emit optional attached signal ripple
      if (action.signal && typeof action.signal === 'object') {
        this._emitSignal(org, action.signal);
      }

      if (action.type === 'move') {
        org.angle = moveAngle;
      } else if (action.type === 'eat' && action.targetId) {
        const target = resMap.get(action.targetId);
        if (target && !target.requiresCoop) {
          const d = Math.hypot(target.x - org.x, target.y - org.y);
          moveAngle = Math.atan2(target.y - org.y, target.x - org.x);
          org.angle = moveAngle;
          if (d <= WORLD_LIMITS.eatRadius) {
            speed = 0.2;
            this._consumeResource(org, target, resMap);
          } else {
            speed = Math.max(0.55, speed || 0.9);
          }
        }
      } else if (action.type === 'cooperateHarvest' && action.targetId) {
        const target = resMap.get(action.targetId);
        if (target && target.kind === 'crystal') {
          moveAngle = Math.atan2(target.y - org.y, target.x - org.x);
          org.angle = moveAngle;
          const d = Math.hypot(target.x - org.x, target.y - org.y);
          if (d <= WORLD_LIMITS.coopRadius) {
            speed = 0.12;
            const group = crystalCoopActors.get(target.id) || [];
            if (group.length < 2) {
              org.telemetry.failedCrystalSolo += 1;
            }
          } else {
            speed = Math.max(0.6, speed || 0.85);
          }
        }
      } else if (action.type === 'photosynthesize') {
        speed = 0.05;
        const gain = Math.max(0, sensors.env.sunlight * 1.35);
        org.energy = Math.min(org.maxEnergy, org.energy + gain);
      } else if (action.type === 'defend') {
        org.isDefending = true;
        org.angle = moveAngle;
        org.energy = Math.max(0, org.energy - 0.35);
      } else if (action.type === 'attack' && action.targetId) {
        const prey = orgMap.get(action.targetId);
        if (prey && prey.alive && prey.id !== org.id) {
          moveAngle = Math.atan2(prey.y - org.y, prey.x - org.x);
          org.angle = moveAngle;
          const d = Math.hypot(prey.x - org.x, prey.y - org.y);
          if (d <= WORLD_LIMITS.attackRadius) {
            org.isAttacking = true;
            speed = 0.3;
            const rawDmg = 18;
            const finalDmg = prey.isDefending ? rawDmg * 0.3 : rawDmg;
            prey.hp = Math.max(0, prey.hp - finalDmg);
            prey.lastDamageCause = 'attack';
            prey.lastDamageAmount = finalDmg;
            prey.telemetry.damageByCause.attack = (prey.telemetry.damageByCause.attack || 0) + finalDmg;
            prey.addEpisode(this.tick, 'ATTACKED', `遭到 ${org.name} 掠食攻击 (-${finalDmg.toFixed(1)} HP)`);
            org.energy = Math.min(org.maxEnergy, org.energy + finalDmg * 1.15);
            org.traits.aggression = Number(Math.min(0.98, org.traits.aggression + 0.02).toFixed(2));
            if (prey.hp <= 0) {
              prey.markDead(this.tick, `被 ${org.name} 捕食`);
              org.energy = Math.min(org.maxEnergy, org.energy + 28);
              this._spawnNaturalResource('detritus', prey.x, prey.y);
              this._addChronicle('PREDATION', `${org.name} (${org.phenotypeInfo.speciesName}) 猎杀了 ${prey.name}`, org.id);
            }
          } else {
            speed = Math.max(0.85, speed || 1.1);
          }
        }
      } else if (action.type === 'shareEnergy' && action.targetId) {
        const ally = orgMap.get(action.targetId);
        if (ally && ally.alive && ally.id !== org.id) {
          const d = Math.hypot(ally.x - org.x, ally.y - org.y);
          if (d <= WORLD_LIMITS.shareRadius && org.energy > 38) {
            const gift = Math.min(action.amount || 16, org.energy - 25);
            if (gift > 2) {
              org.energy -= gift;
              ally.energy = Math.min(ally.maxEnergy, ally.energy + gift * 0.95);
              org.traits.sociability = Number(Math.min(0.98, org.traits.sociability + 0.02).toFixed(2));
              ally.addEpisode(this.tick, 'GIFT', `收到亲属 ${org.name} 输送的能量 (+${gift.toFixed(1)})`);
              this._emitSignal(org, { channel: 'kin', intent: 'ENERGY_SHARE', x: ally.x, y: ally.y });
            }
          }
        }
      } else if (action.type === 'buildStructure' && org.energy > 55 && this.structures.length < WORLD_LIMITS.maxStructures) {
        const kind = action.structureKind === 'cache' ? 'cache' : 'shelter';
        // Avoid stacking structures right on top of existing one
        const tooClose = this.structures.some((s) => Math.hypot(s.x - org.x, s.y - org.y) < 95);
        if (!tooClose) {
          org.energy -= 26;
          this.structures.push({
            id: this._genId('str'),
            kind,
            x: Math.round(org.x),
            y: Math.round(org.y),
            radius: kind === 'shelter' ? 74 : 30,
            ownerId: org.id,
            storedEnergy: 0,
            ttl: kind === 'shelter' ? 1300 : 1800
          });
          org.addEpisode(this.tick, 'BUILD', `建造了一座 ${kind === 'shelter' ? '生态庇护所' : '能量储藏窖'}`);
          this._addChronicle('ECOSYSTEM', `${org.name} 主动改造环境，建造了${kind === 'shelter' ? '生态庇护所' : '能量储藏窖'}`, org.id);
        }
      } else if (action.type === 'storeEnergy' && action.targetId) {
        const cache = strMap.get(action.targetId);
        if (cache && cache.kind === 'cache' && Math.hypot(cache.x - org.x, cache.y - org.y) <= 40 && org.energy > 45) {
          const amt = Math.min(action.amount || 20, org.energy - 35, 120 - cache.storedEnergy);
          if (amt > 1) {
            org.energy -= amt;
            cache.storedEnergy += amt;
          }
        }
      } else if (action.type === 'withdrawEnergy' && action.targetId) {
        const cache = strMap.get(action.targetId);
        if (cache && cache.kind === 'cache' && Math.hypot(cache.x - org.x, cache.y - org.y) <= 40 && cache.storedEnergy > 1) {
          const amt = Math.min(25, cache.storedEnergy);
          cache.storedEnergy -= amt;
          org.energy = Math.min(org.maxEnergy, org.energy + amt);
        }
      } else if (action.type === 'broadcast') {
        this._emitSignal(org, { channel: action.channel || 'general', ...(action.payload || {}) });
      } else if (action.type === 'broadcastMeme' && action.capabilityKey) {
        this._emitMeme(org, action.capabilityKey);
      } else if (action.type === 'reproduce') {
        if (
          org.energy >= 112 &&
          org.hp > 40 &&
          this.organisms.filter((o) => o.alive).length + newOffspring.length < WORLD_LIMITS.maxPopulation
        ) {
          const child = this._tryReproduce(org, orgMap);
          if (child) newOffspring.push(child);
        }
      }

      // Apply spatial motion with smooth damping
      const actualSpeed = Math.max(0, Math.min(1.4, speed)) * 2.9;
      org.vx = org.vx * 0.45 + Math.cos(moveAngle) * actualSpeed * 0.55;
      org.vy = org.vy * 0.45 + Math.sin(moveAngle) * actualSpeed * 0.55;
      org.x += org.vx;
      org.y += org.vy;

      // Soft boundary bounce
      if (org.x < 32) {
        org.x = 32;
        org.angle = Math.PI - org.angle;
      } else if (org.x > WORLD_WIDTH - 32) {
        org.x = WORLD_WIDTH - 32;
        org.angle = Math.PI - org.angle;
      }
      if (org.y < 32) {
        org.y = 32;
        org.angle = -org.angle;
      } else if (org.y > WORLD_HEIGHT - 32) {
        org.y = WORLD_HEIGHT - 32;
        org.angle = -org.angle;
      }

      // Deposit subtle pheromone trail occasionally
      if (actualSpeed > 1.2 && this.tick % 14 === 0 && this.pheromones.length < 180) {
        this.pheromones.push({
          kind: org.lastAction?.type === 'eat' ? 'food' : 'trail',
          x: Math.round(org.x),
          y: Math.round(org.y),
          intensity: 0.75
        });
      }

      // Real Gas-coupled metabolic energy cost + AST genome upkeep + Climate effects
      const gasCost = gasUsed * 0.0018;
      const astUpkeep = (org.compiled?.nodeCount || 80) * 0.00014;
      const moveCost = actualSpeed * 0.058;
      const baseCost = 0.095;
      let coldPenalty = 0;
      if (sensors.env.temperature < 4 && !sensors.env.inShelter && !sensors.env.nearHotSpring) {
        coldPenalty = (4 - sensors.env.temperature) * 0.025;
        org.telemetry.damageByCause.cold = (org.telemetry.damageByCause.cold || 0) + coldPenalty;
      }

      org.energy -= baseCost + moveCost + gasCost + astUpkeep + coldPenalty;

      if (this.weather === 'acidRain' && !sensors.env.inShelter) {
        const acidDmg = 0.85;
        org.hp = Math.max(0, org.hp - acidDmg);
        org.lastDamageCause = 'acidRain';
        org.lastDamageAmount = acidDmg;
        org.telemetry.damageByCause.acidRain = (org.telemetry.damageByCause.acidRain || 0) + acidDmg;
      } else if (sensors.env.nearHotSpring || (sensors.env.inShelter && org.energy > 35)) {
        org.hp = Math.min(org.maxHp, org.hp + 0.22);
      } else if (org.energy > 55 && org.hp < org.maxHp) {
        org.hp = Math.min(org.maxHp, org.hp + 0.06);
      }

      // Starvation HP drain & natural senescence
      if (org.energy <= 0) {
        org.energy = 0;
        org.hp -= 2.4;
        if (org.hp <= 0) {
          org.markDead(this.tick, '能量枯竭饿死');
        }
      } else if (org.hp <= 0) {
        const deathReason =
          org.telemetry.consecutiveErrors >= 3
            ? 'SELF_CODE_FATAL_CRASH'
            : org.lastDamageCause === 'acidRain'
              ? '酸雨腐蚀致死'
              : org.lastDamageCause === 'toxin'
                ? '剧毒孢子中毒死亡'
                : '生命衰竭死亡';
        org.markDead(this.tick, deathReason);
      } else if (org.age > 2600 && this.rng() < 0.002) {
        org.markDead(this.tick, '自然衰老寿终');
      }

      if (!org.alive) {
        this._spawnNaturalResource('detritus', org.x, org.y);
        this._archiveOrganism(org);
        this._addChronicle('DEATH', `${org.name} (${org.phenotypeInfo.speciesName}) 逝去 · 死因: ${org.causeOfDeath}`, org.id);
      }
    }

    // Resolve successful cooperative crystal harvests
    for (const [crystalId, actors] of crystalCoopActors.entries()) {
      const crystal = resMap.get(crystalId);
      if (!crystal || actors.length < 2) continue;
      const share = (crystal.energyValue + actors.length * 14) / actors.length;
      for (const a of actors) {
        a.energy = Math.min(a.maxEnergy, a.energy + share);
        a.hp = Math.min(a.maxHp, a.hp + 6);
        a.telemetry.coopCount += 1;
        a.traits.sociability = Number(Math.min(0.98, a.traits.sociability + 0.03).toFixed(2));
        a.addEpisode(this.tick, 'COOP', `与 ${actors.length - 1} 位同伴声波协作破译共鸣晶簇 (+${share.toFixed(1)} 能量)`);
      }
      this._emitSignal(actors[0], { channel: 'coop', intent: 'CRYSTAL_CRACKED', x: crystal.x, y: crystal.y });
      this._addChronicle(
        'EMERGENCE',
        `涌现协作：${actors.map((x) => x.name).join(' & ')} 通过声波协议联合采获共鸣晶簇！`,
        actors[0].id
      );
      const idx = this.resources.indexOf(crystal);
      if (idx >= 0) this.resources.splice(idx, 1);
    }

    // Append newborn offspring
    for (const child of newOffspring) {
      this.organisms.push(child);
      this.totalCommits += 1;
      this._archiveOrganism(child);
    }

    // Phase 3: Evaluate code commit outcomes + Trigger autonomous self-programming
    for (const org of this.organisms) {
      if (!org.alive) continue;
      const evalOutcome = org.evaluateCommitsAndHealth(this.tick);
      if (evalOutcome?.event === 'ROLLBACK') {
        this.totalCommits += 1;
        this._addChronicle('ROLLBACK', `${org.name} 新代码触发运行异常，已紧急自愈回滚`, org.id);
      }

      if (this._shouldAttemptSelfProgramming(org)) {
        const sensors = sensorsByOrg.get(org.id) || this._buildSensorsFor(org);
        this._runSelfProgramming(org, sensors);
      }
    }

    // Periodically clean dead organisms from active physics list (archived permanently in lineageArchive!)
    if (this.tick % 20 === 0) {
      this.organisms = this.organisms.filter((o) => o.alive);
    }

    if (this.tick % 15 === 0) {
      this._sampleHistory();
    }

    if (!this.disableDiskPersistence && this.tick % 240 === 0) {
      this.saveAutosave();
    }

    this.lastTickDurationMs = Number((performance.now() - tStart).toFixed(2));
  }

  _consumeResource(org, target, resMap) {
    if (target.kind === 'spore' && isHueToxic(target.hue, this.toxicHueCenters)) {
      const dmg = 16;
      org.hp = Math.max(0, org.hp - dmg);
      org.energy = Math.max(0, org.energy - 8);
      org.lastDamageCause = 'toxin';
      org.lastDamageAmount = dmg;
      org.telemetry.damageByCause.toxin = (org.telemetry.damageByCause.toxin || 0) + dmg;
      org.traits.caution = Number(Math.min(0.98, org.traits.caution + 0.04).toFixed(2));
      org.addEpisode(this.tick, 'TOXIN', `误食色相 ${target.hue}° 毒孢子中毒 (-${dmg} HP)`);
      if (org.hp <= 0) {
        org.markDead(this.tick, '剧毒孢子中毒死亡');
      }
    } else {
      org.energy = Math.min(org.maxEnergy, org.energy + target.energyValue);
      if (target.kind === 'spore') org.hp = Math.min(org.maxHp, org.hp + 4);
      org.telemetry.eatCount += 1;
    }

    resMap.delete(target.id);
    const idx = this.resources.indexOf(target);
    if (idx >= 0) this.resources.splice(idx, 1);
  }

  _emitSignal(org, sig) {
    if (this.activeSignals.length > 60) this.activeSignals.shift();
    this.activeSignals.push({
      id: this._genId('sig'),
      fromId: org.id,
      channel: sig.channel || 'general',
      intent: sig.intent || 'PING',
      x: sig.x ?? org.x,
      y: sig.y ?? org.y,
      hue: sig.hue,
      targetId: sig.targetId,
      age: 0
    });
  }

  _emitMeme(org, capabilityKey) {
    if (!org.phenotypeInfo?.capabilities?.[capabilityKey]) return;
    if (this.activeMemes.length > 35) this.activeMemes.shift();
    const meme = {
      id: this._genId('meme'),
      fromId: org.id,
      fromName: org.name,
      speciesName: org.phenotypeInfo.speciesName,
      capabilityKey,
      fitnessScore: Number(org.getFitnessScore().toFixed(1)),
      x: org.x,
      y: org.y,
      age: 0
    };
    this.activeMemes.push(meme);
    org.telemetry.memesShared += 1;

    const existing = this.culturalRegistry.get(capabilityKey) || {
      capabilityKey,
      originatorName: org.name,
      originatorId: org.id,
      adoptions: 0,
      broadcasts: 0
    };
    existing.broadcasts += 1;
    this.culturalRegistry.set(capabilityKey, existing);
  }

  _tryReproduce(org, orgMap) {
    let mate = null;
    for (const other of this.organisms) {
      if (!other.alive || other.id === org.id) continue;
      if (other.energy >= 95 && other.hp > 40) {
        const d = Math.hypot(other.x - org.x, other.y - org.y);
        if (d <= WORLD_LIMITS.reproMateRadius) {
          mate = other;
          break;
        }
      }
    }

    const childId = this._genId('org');
    if (mate) {
      const crossed = createSexualOffspringGenome(org, mate, this.rng);
      org.energy -= 42;
      mate.energy -= 42;
      const childGen = Math.max(org.generation, mate.generation) + 1;
      const child = new Organism({
        id: childId,
        generation: childGen,
        familyId: org.familyId,
        parentIds: [org.id, mate.id],
        birthTick: this.tick,
        x: Math.max(40, Math.min(WORLD_WIDTH - 40, (org.x + mate.x) / 2 + (this.rng() - 0.5) * 28)),
        y: Math.max(40, Math.min(WORLD_HEIGHT - 40, (org.y + mate.y) / 2 + (this.rng() - 0.5) * 28)),
        energy: 78,
        code: crossed.code,
        memory: crossed.epigeneticMemory,
        initialCommit: crossed.commitInfo,
        rng: this.rng
      });
      org.childrenIds.push(child.id);
      mate.childrenIds.push(child.id);
      org.addEpisode(this.tick, 'REPRODUCE', `与 ${mate.name} 发生有性基因交叉，孕育子代 ${child.name}`);
      this._archiveOrganism(org);
      this._archiveOrganism(mate);
      if (crossed.commitInfo.diffPatch) {
        this._addChronicle(
          'SPECIATION',
          `有性基因重组：${org.name} × ${mate.name} 诞生 ${child.name} (${child.phenotypeInfo.speciesName})`,
          child.id
        );
      }
      return child;
    }

    // Asexual mitosis
    const cloned = createAsexualOffspringGenome(org, this.rng);
    org.energy -= 54;
    const child = new Organism({
      id: childId,
      generation: org.generation + 1,
      familyId: org.familyId,
      parentIds: [org.id],
      birthTick: this.tick,
      x: Math.max(40, Math.min(WORLD_WIDTH - 40, org.x + (this.rng() - 0.5) * 32)),
      y: Math.max(40, Math.min(WORLD_HEIGHT - 40, org.y + (this.rng() - 0.5) * 32)),
      energy: 64,
      code: cloned.code,
      memory: cloned.epigeneticMemory,
      initialCommit: cloned.commitInfo,
      rng: this.rng
    });
    org.childrenIds.push(child.id);
    this._archiveOrganism(org);
    return child;
  }

  _shouldAttemptSelfProgramming(org) {
    if (org.telemetry.ticksSinceLastCodeEdit < 60) return false;
    if (org.telemetry.lastError) return true;

    const stress =
      (org.telemetry.damageByCause.toxin || 0) +
      (org.telemetry.damageByCause.acidRain || 0) +
      (org.telemetry.damageByCause.attack || 0) +
      (org.telemetry.failedCrystalSolo >= 1 ? 15 : 0) +
      (org.telemetry.hungryTicks >= 9 ? 12 : 0) +
      (org.telemetry.sawPressureDrop >= 1 ? 6 : 0);

    if (stress >= 14 && this.rng() < 0.16) return true;
    if (org.age > 30 && this.rng() < 0.011 * (0.5 + org.traits.curiosity)) return true;
    return false;
  }

  _runSelfProgramming(org, sensors, mentorHint = '', forceExplore = false) {
    const mergedMemes = [...(sensors.memes || [])];
    for (const m of org.recentHeardMemes || []) {
      if (!mergedMemes.some((x) => x.capabilityKey === m.capabilityKey)) {
        mergedMemes.push(m);
      }
    }
    const sensorsWithMemes = { ...sensors, memes: mergedMemes };

    const ctx = {
      id: org.id,
      name: org.name,
      generation: org.generation,
      codeVersion: org.codeVersion,
      code: org.code,
      telemetry: org.telemetry,
      traits: org.traits,
      experienceFrames: org.experienceFrames,
      sensorsSnapshot: sensorsWithMemes,
      branchHitsTotal: org.branchHitsTotal,
      mentorHint,
      forceExplore
    };

    // If external LLM is enabled, asynchronously invoke LLM for ~30% of self-edits or mentor requests
    if (this.llmArchitect?.isReady() && (mentorHint || this.rng() < 0.3)) {
      this.llmArchitect.synthesizeGenome(ctx).then((llmMod) => {
        if (llmMod && org.alive) {
          this._commitModification(org, llmMod);
        }
      });
      if (!mentorHint) return null;
    }

    const mod = synthesizeSelfModification(ctx, { rng: this.rng });
    if (!mod) return null;
    if (mod.trigger?.startsWith('CULTURAL_MEME_FROM_') && mod.memeTag) {
      org.recentHeardMemes = (org.recentHeardMemes || []).filter((m) => m.capabilityKey !== mod.memeTag);
    }
    return this._commitModification(org, mod);
  }

  _commitModification(org, mod) {
    const prevSpecies = org.phenotypeInfo.speciesSignature;
    const commit = org.applyCodeModification(mod, this.tick);
    this.totalCommits += 1;
    this._archiveOrganism(org);

    if (mod.trigger?.startsWith('CULTURAL_MEME_FROM_') && mod.memeTag) {
      const reg = this.culturalRegistry.get(mod.memeTag);
      if (reg) reg.adoptions += 1;
      this._addChronicle('CULTURE', `文化习得：${org.name} 吸收邻伴模因「${mod.memeTag}」并改写自身源码`, org.id);
    } else if (commit.speciesAfter !== prevSpecies) {
      this._addChronicle(
        'SPECIATION',
        `基因跃迁！${org.name} 自我改写源码 (v${commit.version})，进化为【${org.phenotypeInfo.speciesName}】：${commit.reason}`,
        org.id,
        { commitVersion: commit.version }
      );
    } else {
      this._addChronicle(
        'CODE_EVOLVE',
        `${org.name} 自我编程 v${commit.version}：${commit.reason}`,
        org.id,
        { commitVersion: commit.version }
      );
    }
    return commit;
  }

  // =========================================================================
  // Player God Powers & Direct Organism Interaction
  // =========================================================================

  applyGodAction(payload) {
    const { kind, x, y } = payload;
    const cx = Math.max(40, Math.min(WORLD_WIDTH - 40, Number(x) || WORLD_WIDTH / 2));
    const cy = Math.max(40, Math.min(WORLD_HEIGHT - 40, Number(y) || WORLD_HEIGHT / 2));

    if (kind === 'nectar') {
      for (let i = 0; i < 4; i++) {
        this._spawnNaturalResource('nectar', cx + (this.rng() - 0.5) * 80, cy + (this.rng() - 0.5) * 80);
      }
      this._addChronicle('GOD_ACTION', `造物主在 (${Math.round(cx)}, ${Math.round(cy)}) 降下甘露雨`);
      return { ok: true, message: '已投放甘露集群' };
    }
    if (kind === 'crystal') {
      this._spawnNaturalResource('crystal', cx, cy);
      this._addChronicle('GOD_ACTION', `造物主在 (${Math.round(cx)}, ${Math.round(cy)}) 凝结共鸣晶簇`);
      return { ok: true, message: '已生成共鸣晶簇' };
    }
    if (kind === 'spore') {
      for (let i = 0; i < 3; i++) {
        this._spawnNaturalResource('spore', cx + (this.rng() - 0.5) * 70, cy + (this.rng() - 0.5) * 70);
      }
      this._addChronicle('GOD_ACTION', `造物主播撒变异孢子群`);
      return { ok: true, message: '已播撒化学孢子' };
    }
    if (kind === 'hotSpring') {
      this.structures.push({
        id: this._genId('str'),
        kind: 'hotSpring',
        x: Math.round(cx),
        y: Math.round(cy),
        radius: 125,
        ownerId: 'creator',
        storedEnergy: 0,
        ttl: Infinity
      });
      this._addChronicle('GOD_ACTION', `造物主开辟了一座永恒深渊热泉`);
      return { ok: true, message: '已开辟热泉绿洲' };
    }
    if (kind === 'acidRain') {
      this.weather = 'acidRain';
      this.weatherTicksRemaining = 65;
      this.pressureDrop = false;
      this._addChronicle('WEATHER', `造物主召唤酸雨风暴降临盆地！`);
      return { ok: true, message: '已触发酸雨风暴' };
    }
    if (kind === 'coldSnap') {
      this.weather = 'coldSnap';
      this.weatherTicksRemaining = 70;
      this._addChronicle('WEATHER', `造物主引发骤冷寒潮！`);
      return { ok: true, message: '已触发骤冷寒潮' };
    }
    if (kind === 'seed') {
      const org = this.spawnGenesisOrganism(cx, cy, false);
      if (!org) return { ok: false, error: '当前种群数量已达承载上限' };
      this._addChronicle('GOD_ACTION', `造物主投放新原初生命 ${org.name}`, org.id);
      return { ok: true, organism: org.toCanvasSummary() };
    }
    return { ok: false, error: '未知神权操作' };
  }

  interactWithOrganism(organismId, payload) {
    const org = this.organisms.find((o) => o.id === organismId);
    if (!org || !org.alive) {
      return { ok: false, error: '该生命体不存在或已化作化石' };
    }

    const { action, name, mentorHint, customCode } = payload;

    if (action === 'adopt') {
      org.isAdopted = !org.isAdopted;
      if (name && typeof name === 'string' && name.trim()) {
        org.name = name.trim().slice(0, 24);
      }
      org.addEpisode(this.tick, 'BOND', org.isAdopted ? '与观察者缔结伴生契约' : '解除伴生契约');
      this._archiveOrganism(org);
      return { ok: true, detail: org.toDetailedInspect() };
    }

    if (action === 'rename' && name && typeof name === 'string') {
      org.name = name.trim().slice(0, 24);
      this._archiveOrganism(org);
      return { ok: true, detail: org.toDetailedInspect() };
    }

    if (action === 'feed') {
      org.energy = Math.min(org.maxEnergy, org.energy + 38);
      org.hp = Math.min(org.maxHp, org.hp + 15);
      org.traits.sociability = Number(Math.min(0.98, org.traits.sociability + 0.04).toFixed(2));
      org.addEpisode(this.tick, 'CARE', '接受造物主投喂的高纯能量甘露 (+38 能量, +15 HP)');
      this._archiveOrganism(org);
      return { ok: true, detail: org.toDetailedInspect() };
    }

    if (action === 'heal') {
      org.hp = org.maxHp;
      org.energy = Math.min(org.maxEnergy, org.energy + 18);
      org.addEpisode(this.tick, 'CARE', '受到造物主生态护盾修复，生命值恢复至满值');
      this._archiveOrganism(org);
      return { ok: true, detail: org.toDetailedInspect() };
    }

    if (action === 'evolve') {
      const sensors = this._buildSensorsFor(org);
      const commit = this._runSelfProgramming(org, sensors, mentorHint || '', true);
      if (!commit) {
        return { ok: false, error: '当前环境或心理回放未发现可提升适应度的安全改写方案' };
      }
      return { ok: true, commit, detail: org.toDetailedInspect() };
    }

    if (action === 'patchCode' && typeof customCode === 'string') {
      try {
        const mod = {
          source: 'PLAYER_GENE_SURGERY',
          newCode: customCode,
          trigger: 'MANUAL_CODE_SURGERY',
          reason: payload.reason || '观察者在基因手术室直接部署定制源码',
          hypothesis: payload.hypothesis || '测试人工编辑基因程序在真实沙箱生态中的存续表现'
        };
        const commit = this._commitModification(org, mod);
        return { ok: true, commit, detail: org.toDetailedInspect() };
      } catch (err) {
        return { ok: false, error: `沙箱安全编译拒绝部署：${err.message}` };
      }
    }

    return { ok: false, error: '不支持的互动类型' };
  }

  getOrganismDetail(id) {
    const alive = this.organisms.find((o) => o.id === id && o.alive);
    if (alive) return alive.toDetailedInspect();
    return this.lineageArchive.get(id) || null;
  }

  getPhylogenyData() {
    // Sync live organisms into archive before reading
    for (const org of this.organisms) {
      if (org.alive) this._archiveOrganism(org);
    }
    const nodes = [];
    const edges = [];
    const speciesMap = new Map();

    for (const rec of this.lineageArchive.values()) {
      nodes.push({
        id: rec.id,
        name: rec.name,
        alive: rec.alive,
        isAdopted: rec.isAdopted,
        generation: rec.generation,
        birthTick: rec.birthTick,
        deathTick: rec.deathTick,
        causeOfDeath: rec.causeOfDeath,
        speciesSignature: rec.speciesSignature,
        speciesName: rec.speciesName,
        codeVersion: rec.codeVersion,
        childrenCount: rec.childrenIds?.length || 0,
        primaryHue: rec.phenotype?.primaryHue ?? 190
      });

      for (const pid of rec.parentIds || []) {
        if (this.lineageArchive.has(pid)) {
          edges.push({ from: pid, to: rec.id });
        }
      }

      if (rec.alive) {
        const sp = speciesMap.get(rec.speciesSignature) || {
          signature: rec.speciesSignature,
          name: rec.speciesName,
          count: 0,
          hue: rec.phenotype?.primaryHue ?? 190,
          traits: rec.traitsList || []
        };
        sp.count += 1;
        speciesMap.set(rec.speciesSignature, sp);
      }
    }

    return {
      nodes,
      edges,
      speciesDistribution: [...speciesMap.values()].sort((a, b) => b.count - a.count),
      culturalMemes: [...this.culturalRegistry.values()].sort((a, b) => b.adoptions + b.broadcasts - (a.adoptions + a.broadcasts)),
      historySeries: this.historySeries
    };
  }

  _sampleHistory() {
    const alive = this.organisms.filter((o) => o.alive);
    const species = new Set(alive.map((o) => o.phenotypeInfo.speciesSignature));
    const avgAst =
      alive.length > 0
        ? Number((alive.reduce((s, o) => s + (o.compiled?.nodeCount || 80), 0) / alive.length).toFixed(1))
        : 0;
    const avgEnergy =
      alive.length > 0
        ? Number((alive.reduce((s, o) => s + o.energy, 0) / alive.length).toFixed(1))
        : 0;

    this.historySeries.push({
      tick: this.tick,
      population: alive.length,
      speciesCount: species.size,
      totalCommits: this.totalCommits,
      avgAstNodes: avgAst,
      avgEnergy
    });
    if (this.historySeries.length > 120) {
      this.historySeries.shift();
    }
  }

  getWorldFrame() {
    const alive = this.organisms.filter((o) => o.alive);
    const speciesSet = new Set(alive.map((o) => o.phenotypeInfo.speciesSignature));
    return {
      tick: this.tick,
      epoch: this.epoch,
      speedMultiplier: this.speedMultiplier,
      season: this.season,
      weather: this.weather,
      pressureDrop: this.pressureDrop,
      temperature: this.baseTemperature,
      sunlight: this.sunlight,
      lastTickDurationMs: this.lastTickDurationMs,
      stats: {
        population: alive.length,
        speciesCount: speciesSet.size,
        totalCommits: this.totalCommits,
        cultureCount: this.culturalRegistry.size,
        archivedLineageCount: this.lineageArchive.size
      },
      organisms: alive.map((o) => o.toCanvasSummary()),
      resources: this.resources,
      structures: this.structures,
      signals: this.activeSignals,
      memes: this.activeMemes,
      pheromones: this.pheromones,
      chronicleEvents: this.chronicleEvents.slice(0, 40)
    };
  }

  // =========================================================================
  // Persistence & Snapshots
  // =========================================================================

  toJSON() {
    for (const org of this.organisms) {
      if (org.alive) this._archiveOrganism(org);
    }
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      tick: this.tick,
      epoch: this.epoch,
      season: this.season,
      weather: this.weather,
      weatherTicksRemaining: this.weatherTicksRemaining,
      pressureDrop: this.pressureDrop,
      baseTemperature: this.baseTemperature,
      sunlight: this.sunlight,
      toxicHueCenters: this.toxicHueCenters,
      nextSeqId: this.nextSeqId,
      totalCommits: this.totalCommits,
      organisms: this.organisms.filter((o) => o.alive).map((o) => o.toSerializable()),
      resources: this.resources,
      structures: this.structures,
      chronicleEvents: this.chronicleEvents,
      lineageArchive: [...this.lineageArchive.entries()],
      culturalRegistry: [...this.culturalRegistry.entries()],
      historySeries: this.historySeries
    };
  }

  saveAutosave() {
    if (this.disableDiskPersistence) return;
    fs.writeFileSync(AUTOSAVE_PATH, JSON.stringify(this.toJSON()), 'utf8');
  }

  saveSnapshot(name) {
    const clean = String(name || `snap_t${this.tick}`).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 40);
    const file = path.join(SNAPSHOTS_DIR, `${clean}.json`);
    fs.writeFileSync(file, JSON.stringify(this.toJSON()), 'utf8');
    return { ok: true, name: clean };
  }

  listSnapshots() {
    if (this.disableDiskPersistence || !fs.existsSync(SNAPSHOTS_DIR)) return [];
    return fs
      .readdirSync(SNAPSHOTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(SNAPSHOTS_DIR, f));
        return { name: f.replace(/\.json$/, ''), updatedAt: st.mtime.toISOString(), sizeKb: Math.round(st.size / 1024) };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  loadSnapshot(name) {
    const clean = String(name || '').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    const file = path.join(SNAPSHOTS_DIR, `${clean}.json`);
    if (!fs.existsSync(file)) throw new Error('快照文件不存在');
    this.loadFromFile(file);
    return { ok: true };
  }

  loadFromFile(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    this.tick = data.tick ?? 0;
    this.epoch = data.epoch ?? 1;
    this.season = data.season ?? 'spring';
    this.weather = data.weather ?? 'clear';
    this.weatherTicksRemaining = data.weatherTicksRemaining ?? 120;
    this.pressureDrop = Boolean(data.pressureDrop);
    this.baseTemperature = data.baseTemperature ?? 20;
    this.sunlight = data.sunlight ?? 0.8;
    this.toxicHueCenters = data.toxicHueCenters ?? [22, 300];
    this.nextSeqId = data.nextSeqId ?? 1;
    this.totalCommits = data.totalCommits ?? 0;
    this.resources = data.resources ?? [];
    this.structures = data.structures ?? [];
    this.chronicleEvents = data.chronicleEvents ?? [];
    this.historySeries = data.historySeries ?? [];
    this.activeSignals = [];
    this.activeMemes = [];
    this.pheromones = [];

    this.lineageArchive = new Map(data.lineageArchive || []);
    this.culturalRegistry = new Map(data.culturalRegistry || []);
    this.organisms = (data.organisms || []).map((raw) => new Organism({ ...raw, rng: this.rng }));
  }
}
