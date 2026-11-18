import { createTwoFilesPatch } from 'diff';
import { compileGenome, executeGenomeStep, DEFAULT_GAS_LIMIT } from '../sandbox/GenomeSandbox.js';
import { extractPhenotype } from '../sandbox/PhenotypeExtractor.js';
import { GENESIS_GENOME_CODE } from '../evolution/GenesisGenomes.js';
import { generateOrganismName } from './WorldConfig.js';

export class Organism {
  constructor(params) {
    const rng = params.rng || Math.random;
    this.id = params.id;
    this.generation = params.generation ?? 0;
    this.name = params.name || generateOrganismName(this.generation, rng);
    this.familyId = params.familyId || this.id;
    this.parentIds = Array.isArray(params.parentIds) ? [...params.parentIds] : [];
    this.childrenIds = Array.isArray(params.childrenIds) ? [...params.childrenIds] : [];
    this.birthTick = params.birthTick ?? 0;
    this.deathTick = null;
    this.causeOfDeath = null;
    this.alive = params.alive ?? true;
    this.isAdopted = Boolean(params.isAdopted);

    this.x = params.x;
    this.y = params.y;
    this.vx = params.vx ?? 0;
    this.vy = params.vy ?? 0;
    this.angle = params.angle ?? rng() * Math.PI * 2;

    this.maxEnergy = 180;
    this.energy = params.energy ?? 96;
    this.maxHp = 100;
    this.hp = params.hp ?? 100;
    this.age = params.age ?? 0;

    this.lastDamageCause = null;
    this.lastDamageAmount = 0;
    this.isAttacking = false;
    this.isDefending = false;
    this.lastAction = { type: 'rest', angle: this.angle, speed: 0 };
    this.lastPerception = {};
    this.lastSensorsSummary = null;
    this.codeMutatingEffectTicks = 0;

    this.traits = params.traits || {
      curiosity: Number((0.42 + rng() * 0.42).toFixed(2)),
      caution: Number((0.35 + rng() * 0.4).toFixed(2)),
      sociability: Number((0.35 + rng() * 0.48).toFixed(2)),
      aggression: Number((0.15 + rng() * 0.48).toFixed(2)),
      resilience: Number((0.4 + rng() * 0.35).toFixed(2))
    };

    this.memory = params.memory ? JSON.parse(JSON.stringify(params.memory)) : {};
    this.episodicLog = params.episodicLog ? [...params.episodicLog] : [];
    this.experienceFrames = [];
    this.recentHeardMemes = [];
    this.branchHitsTotal = params.branchHitsTotal ? { ...params.branchHitsTotal } : {};
    this.lastBranchHits = {};
    this.lastGasUsed = 0;
    this.avgGas = 22;

    this.telemetry = params.telemetry || {
      damageByCause: { toxin: 0, acidRain: 0, cold: 0, attack: 0, sandbox: 0 },
      sawCrystalTicks: 0,
      failedCrystalSolo: 0,
      sawPressureDrop: 0,
      hungryTicks: 0,
      highEnergyTicks: 0,
      sawAttacker: 0,
      lastError: null,
      consecutiveErrors: 0,
      ticksSinceLastCodeEdit: 0,
      totalCodeEdits: 0,
      coopCount: 0,
      eatCount: 0,
      memesShared: 0
    };

    this.code = params.code || GENESIS_GENOME_CODE;
    this.codeVersion = params.codeVersion ?? 0;
    this.codeCommits = params.codeCommits ? JSON.parse(JSON.stringify(params.codeCommits)) : [];

    // Compile initial genome inside strict sandbox
    this.compiled = null;
    this.phenotypeInfo = null;
    if (this.alive) {
      this._recompile(this.code);
    } else {
      this.phenotypeInfo = extractPhenotype(this.code, {}, this._hashSeed());
    }

    if (this.codeCommits.length === 0) {
      const initCommit = params.initialCommit || {
        source: this.generation === 0 ? 'GENESIS_SEED' : 'INHERITED',
        trigger: this.generation === 0 ? 'WORLD_GENESIS' : 'BIRTH',
        reason: this.generation === 0 ? '创世原初基因部署：仅具备基础觅食甘露与漫游' : '继承亲代基因代码诞生',
        hypothesis: '维持基础能量代谢与繁衍循环，等待环境压力驱动自我演化',
        diffPatch: ''
      };
      this.codeCommits.push({
        id: `${this.id}_v0`,
        version: 0,
        tick: this.birthTick,
        source: initCommit.source,
        trigger: initCommit.trigger,
        reason: initCommit.reason,
        hypothesis: initCommit.hypothesis,
        diffPatch: initCommit.diffPatch || '',
        codeSnapshot: this.code,
        speciesBefore: this.phenotypeInfo.speciesSignature,
        speciesAfter: this.phenotypeInfo.speciesSignature,
        replayScore: null,
        validation: {
          status: initCommit.diffPatch ? 'EVALUATING' : 'BASELINE',
          startTick: this.birthTick,
          evalTargetTick: this.birthTick + 55,
          startEnergy: Number(this.energy.toFixed(1)),
          startHp: Number(this.hp.toFixed(1)),
          errorsDuringWindow: 0,
          energySamples: 0,
          energyAccum: 0,
          summary: initCommit.diffPatch ? '正在收集 55 刻真实生态反馈...' : '原初基准基因'
        }
      });
    }

    if (this.episodicLog.length === 0) {
      this.addEpisode(this.birthTick, 'BIRTH', `诞生于世界 (第 ${this.generation} 代 · ${this.phenotypeInfo.speciesName})`);
    }
  }

  _hashSeed() {
    let h = 0;
    for (let i = 0; i < this.id.length; i++) {
      h = (h * 31 + this.id.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  _recompile(codeStr) {
    this.compiled = compileGenome(codeStr, {
      organismId: this.id,
      gasLimit: DEFAULT_GAS_LIMIT
    });
    this.phenotypeInfo = extractPhenotype(codeStr, this.compiled, this._hashSeed());
  }

  addEpisode(tick, kind, text) {
    this.episodicLog.unshift({ tick, kind, text });
    if (this.episodicLog.length > 48) {
      this.episodicLog.length = 48;
    }
  }

  getFitnessScore() {
    return (
      this.energy * 0.7 +
      this.hp * 0.6 +
      this.childrenIds.length * 42 +
      this.telemetry.coopCount * 16 +
      this.age * 0.08
    );
  }

  stepMind(sensors, rng = Math.random) {
    if (!this.alive || !this.compiled) return null;

    const prevEnergy = this.energy;
    const prevHp = this.hp;

    // Update introspection telemetry from sensors
    if ((sensors.resources || []).some((r) => r.kind === 'crystal')) {
      this.telemetry.sawCrystalTicks += 1;
    }
    if (sensors.env?.pressureDrop) {
      this.telemetry.sawPressureDrop += 1;
    }
    if (this.energy < 55) {
      this.telemetry.hungryTicks += 1;
    } else if (this.energy > 112) {
      this.telemetry.highEnergyTicks += 1;
    }
    if ((sensors.peers || []).some((p) => p.isAttacking)) {
      this.telemetry.sawAttacker += 1;
    }
    if (Array.isArray(sensors.memes) && sensors.memes.length > 0) {
      for (const m of sensors.memes) {
        if (!this.recentHeardMemes.some((x) => x.capabilityKey === m.capabilityKey && x.fromId === m.fromId)) {
          this.recentHeardMemes.push(m);
          if (this.recentHeardMemes.length > 4) this.recentHeardMemes.shift();
        }
      }
    }

    const res = executeGenomeStep(this.compiled, sensors, this.memory, {
      gasLimit: DEFAULT_GAS_LIMIT,
      rng
    });

    this.lastGasUsed = res.gasUsed;
    this.avgGas = Number((this.avgGas * 0.85 + res.gasUsed * 0.15).toFixed(1));
    this.lastBranchHits = res.branchHits;
    for (const [tag, count] of Object.entries(res.branchHits || {})) {
      this.branchHitsTotal[tag] = (this.branchHitsTotal[tag] || 0) + count;
    }

    this.lastSensorsSummary = {
      biome: sensors.env?.biome,
      weather: sensors.env?.weather,
      temperature: sensors.env?.temperature,
      sunlight: sensors.env?.sunlight,
      resourceCount: (sensors.resources || []).length,
      peerCount: (sensors.peers || []).length,
      signalCount: (sensors.signals || []).length,
      memeCount: (sensors.memes || []).length
    };

    if (res.ok) {
      this.memory = res.memory;
      this.lastAction = res.action;
      this.lastPerception = res.perception;
      this.telemetry.consecutiveErrors = 0;
      this.telemetry.lastError = null;
    } else {
      this.telemetry.lastError = res.error;
      this.telemetry.consecutiveErrors += 1;
      this.telemetry.damageByCause.sandbox = (this.telemetry.damageByCause.sandbox || 0) + 1;
      this.lastAction = { type: 'rest', angle: this.angle, speed: 0 };

      // Sandbox error damages neural integrity
      this.hp = Math.max(0, this.hp - 6);
      this.lastDamageCause = 'sandbox';
      this.lastDamageAmount = 6;
      this.addEpisode(sensors.tick, 'ERROR', `基因沙箱运行异常 (${res.error.type}): ${res.error.message}`);

      const latestCommit = this.codeCommits[this.codeCommits.length - 1];
      if (latestCommit?.validation?.status === 'EVALUATING') {
        latestCommit.validation.errorsDuringWindow += 1;
      }
    }

    // Store experience replay frame (keep last 8)
    this.experienceFrames.push({
      tick: sensors.tick,
      sensors,
      memory: JSON.parse(JSON.stringify(this.memory)),
      action: res.action,
      gasUsed: res.gasUsed,
      energyDelta: Number((this.energy - prevEnergy).toFixed(2)),
      hpDelta: Number((this.hp - prevHp).toFixed(2))
    });
    if (this.experienceFrames.length > 8) {
      this.experienceFrames.shift();
    }

    this.telemetry.ticksSinceLastCodeEdit += 1;
    if (this.codeMutatingEffectTicks > 0) this.codeMutatingEffectTicks -= 1;

    return res;
  }

  /**
   * Apply a new verified genome commit (from AST synthesis, LLM, mentor, or manual Gene Surgery).
   */
  applyCodeModification(mod, tick) {
    const prevSpecies = this.phenotypeInfo?.speciesSignature || 'GEN0-PRIMITIVE';
    const prevCode = this.code;
    const compiled = mod.compiled || compileGenome(mod.newCode, { organismId: this.id });

    this.code = mod.newCode;
    this.compiled = compiled;
    this.codeVersion += 1;
    this.phenotypeInfo = extractPhenotype(this.code, compiled, this._hashSeed());
    this.telemetry.ticksSinceLastCodeEdit = 0;
    this.telemetry.totalCodeEdits += 1;
    this.telemetry.consecutiveErrors = 0;
    this.telemetry.lastError = null;
    this.codeMutatingEffectTicks = 22;

    const diffPatch =
      mod.diffPatch ||
      createTwoFilesPatch(
        `v${this.codeVersion - 1}.js`,
        `v${this.codeVersion}.js`,
        prevCode,
        this.code,
        '',
        '',
        { context: 3 }
      );

    // Finalize any still-evaluating previous commit early
    const prevCommit = this.codeCommits[this.codeCommits.length - 1];
    if (prevCommit && prevCommit.validation.status === 'EVALUATING') {
      this._finalizeCommitValidation(prevCommit, tick);
    }

    const commit = {
      id: `${this.id}_v${this.codeVersion}`,
      version: this.codeVersion,
      tick,
      source: mod.source || 'SELF_AST_SYNTHESIS',
      trigger: mod.trigger || 'AUTONOMOUS',
      reason: mod.reason || '自主优化代码逻辑',
      hypothesis: mod.hypothesis || '期待提升环境适应度',
      diffPatch,
      codeSnapshot: this.code,
      speciesBefore: prevSpecies,
      speciesAfter: this.phenotypeInfo.speciesSignature,
      replayScore: mod.replayScore ?? null,
      validation: {
        status: 'EVALUATING',
        startTick: tick,
        evalTargetTick: tick + 55,
        startEnergy: Number(this.energy.toFixed(1)),
        startHp: Number(this.hp.toFixed(1)),
        errorsDuringWindow: 0,
        energySamples: 0,
        energyAccum: 0,
        summary: '新代码实证追踪中（需 55 刻环境反馈）...'
      }
    };

    this.codeCommits.push(commit);
    if (this.codeCommits.length > 30) {
      // Keep v0 + latest 29 commits
      this.codeCommits = [this.codeCommits[0], ...this.codeCommits.slice(-29)];
    }
    if (this.codeCommits.length > 3) {
      // Trim redundant intermediate full-source snapshots while preserving v0 & latest 2 for rollback
      for (let i = 1; i < this.codeCommits.length - 2; i++) {
        this.codeCommits[i].codeSnapshot = '';
      }
    }

    // Traits gently shift when programming succeeds
    this.traits.curiosity = Number(Math.min(0.98, this.traits.curiosity + 0.03).toFixed(2));
    this.addEpisode(
      tick,
      'CODE_EVOLVE',
      `基因迭代 v${this.codeVersion} (${mod.source}): ${mod.reason}`
    );

    return commit;
  }

  evaluateCommitsAndHealth(tick) {
    const latest = this.codeCommits[this.codeCommits.length - 1];
    if (!latest || latest.validation.status !== 'EVALUATING') return null;

    latest.validation.energySamples += 1;
    latest.validation.energyAccum += this.energy;

    // Auto-rollback if newly introduced code causes >= 3 consecutive sandbox crashes and there is an earlier version
    if (this.telemetry.consecutiveErrors >= 3 && this.codeCommits.length >= 2) {
      const prevCommit = this.codeCommits[this.codeCommits.length - 2];
      try {
        const restoredCode = prevCommit.codeSnapshot;
        this._recompile(restoredCode);
        latest.validation.status = 'REVERTED_ON_CRASH';
        latest.validation.summary = `新代码连续报错 ${this.telemetry.consecutiveErrors} 次导致神经受损，已紧急回滚至 v${prevCommit.version}`;

        const rollbackPatch = createTwoFilesPatch(
          `v${this.codeVersion}.js`,
          `rollback_v${prevCommit.version}.js`,
          this.code,
          restoredCode,
          '',
          '',
          { context: 2 }
        );
        this.code = restoredCode;
        this.codeVersion += 1;
        this.telemetry.consecutiveErrors = 0;
        this.telemetry.lastError = null;
        this.codeCommits.push({
          id: `${this.id}_v${this.codeVersion}`,
          version: this.codeVersion,
          tick,
          source: 'AUTO_ROLLBACK',
          trigger: 'SANDBOX_CRASH_RECOVERY',
          reason: `v${latest.version} 触发连续运行时异常，回退至稳定版本 v${prevCommit.version}`,
          hypothesis: '恢复稳定源码防止进一步代谢/健康崩溃',
          diffPatch: rollbackPatch,
          codeSnapshot: restoredCode,
          speciesBefore: latest.speciesAfter,
          speciesAfter: this.phenotypeInfo.speciesSignature,
          replayScore: null,
          validation: {
            status: 'BENEFICIAL',
            startTick: tick,
            evalTargetTick: tick,
            startEnergy: Number(this.energy.toFixed(1)),
            startHp: Number(this.hp.toFixed(1)),
            errorsDuringWindow: 0,
            energySamples: 1,
            energyAccum: this.energy,
            summary: '紧急回滚成功，恢复生命稳定运行'
          }
        });
        this.traits.caution = Number(Math.min(0.98, this.traits.caution + 0.08).toFixed(2));
        this.addEpisode(tick, 'ROLLBACK', `v${latest.version} 引发沙箱崩溃，自愈回滚至 v${prevCommit.version}`);
        return { event: 'ROLLBACK', commit: latest };
      } catch {
        // Unable to rollback cleanly
      }
    }

    if (tick >= latest.validation.evalTargetTick) {
      this._finalizeCommitValidation(latest, tick);
      return { event: 'VALIDATED', commit: latest };
    }
    return null;
  }

  _finalizeCommitValidation(commit, tick) {
    const v = commit.validation;
    const avgEnergy = v.energySamples > 0 ? v.energyAccum / v.energySamples : this.energy;
    const energyDelta = this.energy - v.startEnergy;
    const hpDelta = this.hp - v.startHp;

    if (!this.alive) {
      v.status = 'FATAL_BUG';
      v.summary = `修改后 ${tick - v.startTick} 刻内死亡 (${this.causeOfDeath || '未知'})`;
      return;
    }

    if (v.errorsDuringWindow > 0) {
      v.status = 'DELETERIOUS';
      v.summary = `观察期内触发 ${v.errorsDuringWindow} 次运行异常，能量变化 ${energyDelta >= 0 ? '+' : ''}${energyDelta.toFixed(1)}`;
    } else if (energyDelta >= 6 || (avgEnergy >= v.startEnergy && hpDelta >= -2)) {
      v.status = 'BENEFICIAL';
      v.summary = `验证有效：能量 ${energyDelta >= 0 ? '+' : ''}${energyDelta.toFixed(1)}，生命值 ${hpDelta >= 0 ? '+' : ''}${hpDelta.toFixed(1)}，零崩溃`;
    } else if (energyDelta <= -18 || hpDelta <= -18) {
      v.status = 'DELETERIOUS';
      v.summary = `适应度下降：能量 ${energyDelta.toFixed(1)}，生命值 ${hpDelta.toFixed(1)}`;
    } else {
      v.status = 'NEUTRAL';
      v.summary = `表现平稳：能量变化 ${energyDelta >= 0 ? '+' : ''}${energyDelta.toFixed(1)}，稳定存续`;
    }
  }

  markDead(tick, cause) {
    if (!this.alive) return;
    this.alive = false;
    this.deathTick = tick;
    this.causeOfDeath = cause;
    const latest = this.codeCommits[this.codeCommits.length - 1];
    if (latest && latest.validation.status === 'EVALUATING') {
      if (cause === 'SELF_CODE_FATAL_CRASH' || latest.validation.errorsDuringWindow > 0) {
        latest.validation.status = 'FATAL_BUG';
        latest.validation.summary = `新代码引入缺陷直接导致死亡 (${cause})`;
      } else {
        this._finalizeCommitValidation(latest, tick);
      }
    }
    this.addEpisode(tick, 'DEATH', `生命终结 (${cause}) · 享年 ${this.age} 刻`);
  }

  /**
   * Compact snapshot sent at ~12fps over WebSocket for canvas rendering.
   */
  toCanvasSummary() {
    return {
      id: this.id,
      name: this.name,
      alive: this.alive,
      isAdopted: this.isAdopted,
      x: Number(this.x.toFixed(1)),
      y: Number(this.y.toFixed(1)),
      angle: Number(this.angle.toFixed(3)),
      energy: Number(this.energy.toFixed(1)),
      maxEnergy: this.maxEnergy,
      hp: Number(this.hp.toFixed(1)),
      maxHp: this.maxHp,
      age: this.age,
      generation: this.generation,
      familyId: this.familyId,
      codeVersion: this.codeVersion,
      lastGasUsed: this.lastGasUsed,
      lastActionType: this.lastAction?.type || 'rest',
      isAttacking: this.isAttacking,
      isDefending: this.isDefending,
      codeMutatingEffectTicks: this.codeMutatingEffectTicks,
      speciesSignature: this.phenotypeInfo.speciesSignature,
      speciesName: this.phenotypeInfo.speciesName,
      traitsList: this.phenotypeInfo.traits,
      phenotype: this.phenotypeInfo.phenotype
    };
  }

  /**
   * Full scientific inspection payload for right-hand Inspector & Phylogeny modal.
   */
  toDetailedInspect() {
    return {
      ...this.toCanvasSummary(),
      birthTick: this.birthTick,
      deathTick: this.deathTick,
      causeOfDeath: this.causeOfDeath,
      parentIds: this.parentIds,
      childrenIds: this.childrenIds,
      personality: this.traits,
      avgGas: this.avgGas,
      gasLimit: DEFAULT_GAS_LIMIT,
      astNodeCount: this.compiled?.nodeCount ?? 0,
      branchCount: this.compiled?.branchCount ?? 0,
      branchLines: this.compiled?.branchLines ?? {},
      lastBranchHits: this.lastBranchHits,
      branchHitsTotal: this.branchHitsTotal,
      code: this.code,
      memory: this.memory,
      lastAction: this.lastAction,
      lastPerception: this.lastPerception,
      lastSensorsSummary: this.lastSensorsSummary,
      telemetry: this.telemetry,
      episodicLog: this.episodicLog,
      codeCommits: this.codeCommits,
      capabilities: this.phenotypeInfo.capabilities
    };
  }

  toSerializable() {
    return {
      id: this.id,
      name: this.name,
      generation: this.generation,
      familyId: this.familyId,
      parentIds: this.parentIds,
      childrenIds: this.childrenIds,
      birthTick: this.birthTick,
      deathTick: this.deathTick,
      causeOfDeath: this.causeOfDeath,
      alive: this.alive,
      isAdopted: this.isAdopted,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      energy: this.energy,
      maxEnergy: this.maxEnergy,
      hp: this.hp,
      maxHp: this.maxHp,
      age: this.age,
      traits: this.traits,
      memory: this.memory,
      episodicLog: this.episodicLog,
      branchHitsTotal: this.branchHitsTotal,
      telemetry: this.telemetry,
      code: this.code,
      codeVersion: this.codeVersion,
      codeCommits: this.codeCommits.map((c, idx, arr) =>
        idx === 0 || idx >= arr.length - 2 ? c : { ...c, codeSnapshot: '' }
      )
    };
  }
}
