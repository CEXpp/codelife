import { createTwoFilesPatch } from 'diff';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { auditGenomeAST, compileGenome, executeGenomeStep } from '../sandbox/GenomeSandbox.js';
import { extractPhenotype } from '../sandbox/PhenotypeExtractor.js';

function parseASTUnchecked(code) {
  return acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script', locations: true });
}

/**
 * Find the BlockStatement of a top-level function (`perceive` or `decide`).
 */
function findTopLevelFunctionBody(ast, fnName) {
  for (const stmt of ast.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === fnName && stmt.body) {
      return stmt.body;
    }
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (
          decl.id?.name === fnName &&
          decl.init &&
          (decl.init.type === 'FunctionExpression' || decl.init.type === 'ArrowFunctionExpression') &&
          decl.init.body?.type === 'BlockStatement'
        ) {
          return decl.init.body;
        }
      }
    }
  }
  return null;
}

/**
 * Safely splice perception enhancement code right before `perceive` returns.
 */
function splicePerceive(code, ast, snippetLines) {
  const body = findTopLevelFunctionBody(ast, 'perceive');
  if (!body) return null;

  const retStmt = [...body.body].reverse().find((s) => s.type === 'ReturnStatement');
  if (!retStmt || !retStmt.argument) return null;

  if (retStmt.argument.type === 'Identifier') {
    const varName = retStmt.argument.name;
    const injected = snippetLines.replaceAll('__P__', varName);
    return (
      code.slice(0, retStmt.start) +
      `${injected}\n  ` +
      code.slice(retStmt.start)
    );
  }

  const exprText = code.slice(retStmt.argument.start, retStmt.argument.end);
  const injected = snippetLines.replaceAll('__P__', '_p');
  const replacement = `const _p = (${exprText});\n  ${injected}\n  return _p;`;
  return code.slice(0, retStmt.start) + replacement + code.slice(retStmt.end);
}

/**
 * Safely splice decision code into `decide` at the requested priority point:
 * - 'top': very beginning of `decide` (e.g., damage/memory observers)
 * - 'urgent': right after reproduction check (or top if no repro check)
 * - 'opportunity': right before basic foraging `if (p.food)` or final fallback move/return
 */
function spliceDecide(code, ast, snippet, priority = 'opportunity') {
  const body = findTopLevelFunctionBody(ast, 'decide');
  if (!body) return null;

  let insertPos = body.start + 1;
  const stmts = body.body;

  if (priority === 'top') {
    insertPos = body.start + 1;
  } else if (priority === 'urgent') {
    const reproIdx = stmts.findIndex((s) => code.slice(s.start, s.end).includes("'reproduce'") || code.slice(s.start, s.end).includes('"reproduce"'));
    if (reproIdx >= 0) {
      insertPos = stmts[reproIdx].end;
    } else if (stmts.length > 0) {
      insertPos = stmts[0].start;
    }
  } else {
    // 'opportunity': insert right before basic nectar forage (`p.food`) or last ReturnStatement
    const forageIdx = stmts.findIndex((s) => {
      const slice = code.slice(s.start, s.end);
      return slice.includes('p.food') || slice.includes('_p.food');
    });
    if (forageIdx >= 0) {
      insertPos = stmts[forageIdx].start;
    } else {
      const lastRetIdx = stmts.findIndex((s) => s.type === 'ReturnStatement');
      if (lastRetIdx >= 0) {
        insertPos = stmts[lastRetIdx].start;
      } else if (stmts.length > 0) {
        insertPos = stmts[stmts.length - 1].start;
      }
    }
  }

  return code.slice(0, insertPos) + `\n  ${snippet}\n  ` + code.slice(insertPos);
}

function parseMentorIntent(mentorHint = '') {
  const h = String(mentorHint || '').toLowerCase();
  return {
    wantsToxin: /毒|孢子|toxin|spore|poison/.test(h),
    wantsCrystal: /晶|协|合作|声波|crystal|coop|team/.test(h),
    wantsShelter: /寒|冬|冷|酸雨|风|庇护|热泉|巢|shelter|cold|rain|spring/.test(h),
    wantsPhoto: /光|太阳|叶绿|自养|photo|sun/.test(h),
    wantsCache: /储|藏|窖|粮|冬眠|cache|store/.test(h),
    wantsShare: /分享|互助|亲|同伴|友|share|kin|help/.test(h),
    wantsDefend: /逃|防|护|危|避|flee|defend|escape/.test(h),
    wantsAttack: /捕食|猎|攻|肉|attack|hunt|predator/.test(h),
    wantsScavenge: /腐|清道|残骸|detritus|scavenge/.test(h),
    wantsMeme: /模因|文化|传|教|meme|teach|culture/.test(h),
    wantsOptimize: /优化|省电|精简|算力|gas|opt/.test(h)
  };
}

// ============================================================================
// Candidate Code Generators (Modular AST Transformations)
// ============================================================================

function buildToxinMemoryCandidate(code, ast, caps, traits) {
  if (caps.hasToxinMemory) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 孢子化学色相识毒滤波]
  const toxicList = Array.isArray(memory.toxicHues) ? memory.toxicHues : [];
  let safeSpore = null;
  let bestSporeScore = -1;
  const _resT = sensors.resources || [];
  for (let i = 0; i < _resT.length; i++) {
    const r = _resT[i];
    if (r.kind === 'spore') {
      let isBad = false;
      for (let j = 0; j < toxicList.length; j++) {
        const diff = Math.abs((r.hue || 0) - toxicList[j]);
        if (diff < 22 || diff > 338) { isBad = true; break; }
      }
      if (!isBad) {
        const sc = (r.energyValue || 20) / (r.dist + 25);
        if (sc > bestSporeScore) { bestSporeScore = sc; safeSpore = r; }
      }
    }
  }
  let warnedHue = null;
  const _sigsT = sensors.signals || [];
  for (let i = 0; i < _sigsT.length; i++) {
    if (_sigsT[i].intent === 'TOXIN_WARN' && typeof _sigsT[i].hue === 'number') {
      warnedHue = _sigsT[i].hue;
    }
  }
  __P__.safeSpore = safeSpore;
  __P__.warnedHue = warnedHue;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  const shareWarnSnippet =
    traits.sociability >= 0.42
      ? `, signal: { channel: 'warn', intent: 'TOXIN_WARN', hue: memory.lastSporeHue, x: sensors.x, y: sensors.y }`
      : '';

  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 毒孢子负反馈记忆与跨个体预警]
  if (!Array.isArray(memory.toxicHues)) memory.toxicHues = [];
  if (typeof p.warnedHue === 'number' && memory.toxicHues.indexOf(p.warnedHue) === -1 && memory.toxicHues.length < 12) {
    memory.toxicHues.push(p.warnedHue);
  }
  if (sensors.self.lastDamageCause === 'toxin' && typeof memory.lastSporeHue === 'number') {
    const rounded = Math.round(memory.lastSporeHue);
    if (memory.toxicHues.indexOf(rounded) === -1 && memory.toxicHues.length < 12) {
      memory.toxicHues.push(rounded);
    }
    memory.lastSporeHue = null;
    return { type: 'move', angle: utils.normAngle((sensors.self.angle || 0) + Math.PI), speed: 0.95${shareWarnSnippet} };
  }`,
    'top'
  );
  if (!next) return null;

  const ast3 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast3,
    `if (p.safeSpore && (!p.food || p.safeSpore.dist < p.foodDist * 1.15)) {
    memory.lastSporeHue = p.safeSpore.hue;
    return { type: 'eat', targetId: p.safeSpore.id, angle: utils.angleTo(sensors.x, sensors.y, p.safeSpore.x, p.safeSpore.y), speed: 0.96 };
  }`,
    'opportunity'
  );

  return {
    key: 'toxin_memory',
    code: next,
    trigger: 'TOXIN_DAMAGE_OR_SPORE_EXPOSURE',
    reason: '检测到毒孢子化学伤害或环境存在高能孢子，主动编写色相毒性记忆过滤器与安全孢子采食分支',
    hypothesis: '通过 memory.toxicHues 记忆有毒色相并倾听同伴 TOXIN_WARN 信号，可降低中毒失血概率并利用无毒高能孢子',
    memeTag: 'hasToxinMemory'
  };
}

function buildCoopCrystalCandidate(code, ast, caps) {
  if (caps.hasCoopCrystal) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 共鸣晶簇感知与同伴声波召集检测]
  let nearCrystal = null;
  let minCryDist = 99999;
  const _resC = sensors.resources || [];
  for (let i = 0; i < _resC.length; i++) {
    if (_resC[i].kind === 'crystal' && _resC[i].dist < minCryDist) {
      minCryDist = _resC[i].dist;
      nearCrystal = _resC[i];
    }
  }
  let cryCall = null;
  const _sigsC = sensors.signals || [];
  for (let i = 0; i < _sigsC.length; i++) {
    if (_sigsC[i].intent === 'CRYSTAL_CALL') { cryCall = _sigsC[i]; break; }
  }
  let nearbyPeers = 0;
  const _peersC = sensors.peers || [];
  for (let i = 0; i < _peersC.length; i++) {
    if (_peersC[i].dist < 54) nearbyPeers++;
  }
  __P__.crystal = nearCrystal;
  __P__.crystalCall = cryCall;
  __P__.nearbyPeers = nearbyPeers;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 声波协作开采共鸣晶簇协议]
  if (p.crystalCall && sensors.energy > 34 && (!p.crystal || p.crystalCall.dist < p.crystal.dist + 40)) {
    const aCall = utils.angleTo(sensors.x, sensors.y, p.crystalCall.x, p.crystalCall.y);
    if (p.crystal && p.crystal.dist < 42) {
      return { type: 'cooperateHarvest', targetId: p.crystal.id, angle: utils.angleTo(sensors.x, sensors.y, p.crystal.x, p.crystal.y), speed: 0.85 };
    }
    return { type: 'move', angle: aCall, speed: 1.05 };
  }
  if (p.crystal && sensors.energy > 28) {
    const aCry = utils.angleTo(sensors.x, sensors.y, p.crystal.x, p.crystal.y);
    if (p.nearbyPeers >= 1) {
      return { type: 'cooperateHarvest', targetId: p.crystal.id, angle: aCry, speed: 0.88 };
    }
    return {
      type: 'cooperateHarvest',
      targetId: p.crystal.id,
      angle: aCry,
      speed: 0.72,
      signal: { channel: 'coop', intent: 'CRYSTAL_CALL', x: p.crystal.x, y: p.crystal.y, targetId: p.crystal.id }
    };
  }`,
    'opportunity'
  );

  return {
    key: 'coop_crystal',
    code: next,
    trigger: 'UNEXPLOITED_RESONANCE_CRYSTAL',
    reason: '观察到单兵无法采掘的高能共鸣晶簇，合成声波招募信号(CRYSTAL_CALL)与双人同步采晶协议',
    hypothesis: '通过广播坐标吸引同伴并发起 cooperateHarvest，能解锁常规觅食数倍的能量收益',
    memeTag: 'hasCoopCrystal'
  };
}

function buildClimateShelterCandidate(code, ast, caps) {
  if (caps.hasShelterLogic) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 热泉与庇护所空间记忆]
  let nearHaven = null;
  let minHavenDist = 99999;
  const _st = sensors.structures || [];
  for (let i = 0; i < _st.length; i++) {
    if ((_st[i].kind === 'hotSpring' || _st[i].kind === 'shelter') && _st[i].dist < minHavenDist) {
      minHavenDist = _st[i].dist;
      nearHaven = _st[i];
    }
  }
  if (nearHaven) {
    memory.safeHaven = { x: nearHaven.x, y: nearHaven.y };
  }
  __P__.haven = nearHaven;
  __P__.harshEnv = sensors.env.weather === 'acidRain' || sensors.env.pressureDrop || sensors.env.temperature < 6;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 极端气候避险与生态筑巢]
  if (p.harshEnv && !sensors.env.inShelter && !sensors.env.nearHotSpring) {
    const targetHaven = p.haven || memory.safeHaven;
    if (sensors.energy > 86 && (!targetHaven || utils.dist(sensors.x, sensors.y, targetHaven.x, targetHaven.y) > 190)) {
      return { type: 'buildStructure', structureKind: 'shelter' };
    }
    if (targetHaven) {
      return { type: 'move', angle: utils.angleTo(sensors.x, sensors.y, targetHaven.x, targetHaven.y), speed: 1.05 };
    }
  }`,
    'urgent'
  );

  return {
    key: 'climate_shelter',
    code: next,
    trigger: 'WEATHER_PRESSURE_OR_COLD_STRESS',
    reason: '因寒潮低温代谢飙升或酸雨损伤，自主编写热泉坐标空间记忆(safeHaven)及高能时建造庇护所代码',
    hypothesis: '监听气压骤降前兆与低温信号提前避入热泉或建造庇护所，可大幅减少环境掉血与寒冷耗能',
    memeTag: 'hasShelterLogic'
  };
}

function buildPhotosynthesisCandidate(code, ast, caps) {
  if (caps.hasPhotosynthesis) return null;
  const next = spliceDecide(
    code,
    ast,
    `// [自我演化: 日光充足时激活光合自养节能模式]
  if (sensors.env.sunlight >= 0.52 && sensors.energy < 118 && (!p.food || p.foodDist > 135)) {
    return { type: 'photosynthesize' };
  }`,
    'opportunity'
  );
  if (!next) return null;

  return {
    key: 'photosynthesis',
    code: next,
    trigger: 'HIGH_SUNLIGHT_SCARCE_FOOD',
    reason: '发现周围食物稀缺但光照充沛，合成叶绿体光合自养行为分支',
    hypothesis: '在无近距甘露时静止执行 photosynthesize()，以极低算力和零移动成本稳定获取净能量',
    memeTag: 'hasPhotosynthesis'
  };
}

function buildEnergyCacheCandidate(code, ast, caps) {
  if (caps.hasCacheLogic) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 能量储藏窖状态感知]
  let nearCache = null;
  const _stCache = sensors.structures || [];
  for (let i = 0; i < _stCache.length; i++) {
    if (_stCache[i].kind === 'cache' && (!nearCache || _stCache[i].dist < nearCache.dist)) {
      nearCache = _stCache[i];
    }
  }
  __P__.nearCache = nearCache;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 丰收窖藏与饥荒取用逻辑]
  if (sensors.energy < 42 && p.nearCache && p.nearCache.storedEnergy >= 12) {
    if (p.nearCache.dist <= 34) {
      return { type: 'withdrawEnergy', targetId: p.nearCache.id };
    }
    return { type: 'move', angle: utils.angleTo(sensors.x, sensors.y, p.nearCache.x, p.nearCache.y), speed: 1.0 };
  }
  if (sensors.energy > 112 && sensors.env.season !== 'winter') {
    if (!p.nearCache || p.nearCache.dist > 260) {
      return { type: 'buildStructure', structureKind: 'cache' };
    }
    if (p.nearCache.dist <= 34 && p.nearCache.storedEnergy < 80) {
      return { type: 'storeEnergy', targetId: p.nearCache.id, amount: 22 };
    }
  }`,
    'opportunity'
  );

  return {
    key: 'energy_cache',
    code: next,
    trigger: 'ENERGY_SURPLUS_SEASONAL_PLANNING',
    reason: '处于高能盈余期但面临季节交替风险，合成建造能量窖(cache)并实现盈余存储、饥荒提取逻辑',
    hypothesis: '建立跨季节能量缓冲库可在寒冬期食物枯竭时显著提升生存率',
    memeTag: 'hasCacheLogic'
  };
}

function buildKinAltruismCandidate(code, ast, caps) {
  if (caps.hasShareEnergy) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 血缘亲属饥饿探测]
  let needyKin = null;
  const _peersK = sensors.peers || [];
  for (let i = 0; i < _peersK.length; i++) {
    const pr = _peersK[i];
    if (pr.kinship >= 0.32 && pr.energy < 48 && (!needyKin || pr.energy < needyKin.energy)) {
      needyKin = pr;
    }
  }
  __P__.needyKin = needyKin;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 血缘利他能量哺育]
  if (p.needyKin && sensors.energy > 92) {
    if (p.needyKin.dist <= 44) {
      return { type: 'shareEnergy', targetId: p.needyKin.id, amount: 18 };
    }
    return { type: 'move', angle: utils.angleTo(sensors.x, sensors.y, p.needyKin.x, p.needyKin.y), speed: 0.95 };
  }`,
    'opportunity'
  );

  return {
    key: 'kin_altruism',
    code: next,
    trigger: 'KIN_STARVATION_OBSERVED',
    reason: '感知到低能量高亲缘度同伴，在高社交神经调质驱动下编写血缘能量互助模块',
    hypothesis: '能量充裕时向濒危亲属输送 18 单位能量，可保障家族基因系在恶劣期存续',
    memeTag: 'hasShareEnergy'
  };
}

function buildDefenseEvasionCandidate(code, ast, caps) {
  if (caps.hasDefend) return null;
  let next = splicePerceive(
    code,
    ast,
    `// [自我演化: 捕食者威胁向量感知]
  let threat = null;
  const _peersD = sensors.peers || [];
  for (let i = 0; i < _peersD.length; i++) {
    const pr = _peersD[i];
    if (pr.dist < 115 && (pr.isAttacking || (pr.kinship < 0.2 && pr.energy > sensors.energy + 25))) {
      if (!threat || pr.dist < threat.dist) threat = pr;
    }
  }
  __P__.threat = threat;`
  );
  if (!next) return null;

  const ast2 = parseASTUnchecked(next);
  next = spliceDecide(
    next,
    ast2,
    `// [自我演化: 遭遇攻击时的防御甲壳与警报逃逸]
  if (p.threat || sensors.self.lastDamageCause === 'attack') {
    const fleeAngle = p.threat
      ? utils.normAngle(utils.angleTo(p.threat.x, p.threat.y, sensors.x, sensors.y))
      : utils.normAngle((sensors.self.angle || 0) + Math.PI);
    if (p.threat && p.threat.dist < 38) {
      return {
        type: 'defend',
        angle: fleeAngle,
        speed: 1.12,
        signal: { channel: 'warn', intent: 'DANGER', x: sensors.x, y: sensors.y }
      };
    }
    return { type: 'move', angle: fleeAngle, speed: 1.15 };
  }`,
    'urgent'
  );

  return {
    key: 'defense_evasion',
    code: next,
    trigger: 'PREDATION_THREAT_OR_ATTACK_DAMAGE',
    reason: '因遭受掠食攻击受损，主动编写威胁向量识别、防御姿态开启及危险广播逃逸逻辑',
    hypothesis: '在近身被咬时启用 defend 减伤 70% 并反向高速逃离，可有效对抗捕食者',
    memeTag: 'hasDefend'
  };
}

function buildScavengeOrPredationCandidate(code, ast, caps, traits, telemetry) {
  // Prefer scavenging detritus first; only high aggression + severe hunger unlocks active predation
  if (!caps.hasScavenge) {
    let next = splicePerceive(
      code,
      ast,
      `// [自我演化: 有机碎屑(腐食)探测]
  let detritus = null;
  const _resS = sensors.resources || [];
  for (let i = 0; i < _resS.length; i++) {
    if (_resS[i].kind === 'detritus' && (!detritus || _resS[i].dist < detritus.dist)) {
      detritus = _resS[i];
    }
  }
  __P__.detritus = detritus;`
    );
    if (!next) return null;

    const ast2 = parseASTUnchecked(next);
    next = spliceDecide(
      next,
      ast2,
      `if (p.detritus && (!p.food || p.detritus.dist < p.foodDist)) {
    return { type: 'eat', targetId: p.detritus.id, angle: utils.angleTo(sensors.x, sensors.y, p.detritus.x, p.detritus.y), speed: 0.96 };
  }`,
      'opportunity'
    );
    return {
      key: 'scavenge_detritus',
      code: next,
      trigger: 'DETRITUS_ECOLOGICAL_NICHE',
      reason: '探测到遗留生物碎屑能量未被利用，合成腐食清道生态位采集分支',
      hypothesis: '回收死亡生物化作的有机碎屑可开辟第二稳定食物来源',
      memeTag: 'hasScavenge'
    };
  }

  if (!caps.hasAttack && (traits.aggression >= 0.62 || telemetry.hungryTicks >= 10)) {
    let next = splicePerceive(
      code,
      ast,
      `// [自我演化: 猎物识别传感器]
  let prey = null;
  const _peersP = sensors.peers || [];
  for (let i = 0; i < _peersP.length; i++) {
    const pr = _peersP[i];
    if (pr.kinship < 0.22 && pr.dist < 110 && pr.hp < sensors.hp * 1.05) {
      if (!prey || pr.dist < prey.dist) prey = pr;
    }
  }
  __P__.prey = prey;`
    );
    if (!next) return null;

    const ast2 = parseASTUnchecked(next);
    next = spliceDecide(
      next,
      ast2,
      `// [自我演化: 极端饥饿驱动的异族捕食策略]
  if (p.prey && sensors.energy < 68) {
    return { type: 'attack', targetId: p.prey.id, angle: utils.angleTo(sensors.x, sensors.y, p.prey.x, p.prey.y), speed: 1.14 };
  }`,
      'opportunity'
    );
    return {
      key: 'predation',
      code: next,
      trigger: 'SEVERE_HUNGER_HIGH_AGGRESSION',
      reason: '长期饥饿与高攻击神经调质触发食性突破，合成对非亲缘虚弱个体的主动捕食代码',
      hypothesis: '在低能量时猎杀无亲缘关系的弱势个体可直接夺取高密度能量，但也可能引发目标反抗或群体排斥',
      memeTag: 'hasAttack'
    };
  }

  return null;
}

function buildMemeBroadcastOrParameterTune(code, ast, caps, telemetry, branchHitsTotal, rng) {
  // 1) If organism already evolved useful traits and doesn't yet share cultural memes, add meme broadcasting!
  const evolvedKeys = [];
  if (caps.hasToxinMemory) evolvedKeys.push('hasToxinMemory');
  if (caps.hasCoopCrystal) evolvedKeys.push('hasCoopCrystal');
  if (caps.hasShelterLogic) evolvedKeys.push('hasShelterLogic');
  if (caps.hasPhotosynthesis) evolvedKeys.push('hasPhotosynthesis');
  if (caps.hasShareEnergy) evolvedKeys.push('hasShareEnergy');

  if (!caps.hasMemeShare && evolvedKeys.length >= 1) {
    const chosenKey = evolvedKeys[Math.floor(rng() * evolvedKeys.length)];
    const next = spliceDecide(
      code,
      ast,
      `// [自我演化: 跨个体文化模因代码传播]
  if (sensors.energy > 96 && sensors.peers.length > 0 && sensors.tick % 17 === 0) {
    return { type: 'broadcastMeme', capabilityKey: '${chosenKey}' };
  }`,
      'opportunity'
    );
    if (next) {
      return {
        key: 'meme_broadcast',
        code: next,
        trigger: 'CULTURAL_TEACHING_EMERGENCE',
        reason: `自身已掌握优势策略 (${chosenKey})，在群体交互中主动合成文化代码模因广播模块`,
        hypothesis: '通过向周围个体广播已验证基因模因，可加速族群文化知识积累并提升群体协同存活率',
        memeTag: 'hasMemeShare'
      };
    }
  }

  // 2) Try dead-branch pruning or GENE constant tuning via AST Literal inspection
  const numericNodes = [];
  walk.simple(ast, {
    Property(node) {
      if (
        node.key?.type === 'Identifier' &&
        ['reproEnergy', 'forageSpeed', 'wanderSpeed', 'wanderTurn'].includes(node.key.name) &&
        node.value?.type === 'Literal' &&
        typeof node.value.value === 'number'
      ) {
        numericNodes.push({
          name: node.key.name,
          value: node.value.value,
          start: node.value.start,
          end: node.value.end
        });
      }
    }
  });

  if (numericNodes.length > 0) {
    const target = numericNodes[Math.floor(rng() * numericNodes.length)];
    let newVal = target.value;
    let explain = '';
    if (target.name === 'reproEnergy') {
      newVal = telemetry.hungryTicks > 8 ? Math.min(142, Math.round(target.value + 8)) : Math.max(106, Math.round(target.value - 8));
      explain = telemetry.hungryTicks > 8 ? '饥饿期延后繁殖阈值以保命' : '能量充裕期提前繁殖阈值以扩增血脉';
    } else if (target.name === 'forageSpeed') {
      newVal = Number(Math.min(1.22, Math.max(0.7, target.value + (telemetry.hungryTicks > 5 ? 0.1 : -0.06))).toFixed(2));
      explain = '根据觅食压力自适应微调冲刺速度常数';
    } else if (target.name === 'wanderSpeed') {
      newVal = Number(Math.min(0.9, Math.max(0.42, target.value + (rng() > 0.5 ? 0.08 : -0.08))).toFixed(2));
      explain = '调节漫游功耗与探索半径的平衡常数';
    } else {
      newVal = Number((target.value * (rng() > 0.5 ? 1.12 : 0.88)).toFixed(2));
      explain = `动态微调基因参数 ${target.name}`;
    }

    if (newVal !== target.value) {
      const next = code.slice(0, target.start) + String(newVal) + code.slice(target.end);
      return {
        key: 'gene_param_tune',
        code: next,
        trigger: 'METABOLIC_AND_FITNESS_OPTIMIZATION',
        reason: `${explain} (${target.name}: ${target.value} → ${newVal})`,
        hypothesis: `调整 ${target.name} 参数以适配当前生态节奏与算力代谢收支`,
        memeTag: null
      };
    }
  }

  // 3) Check dead IfStatement pruning if avgGas is high and a branch had 0 hits
  if (telemetry.avgGas > 90 && branchHitsTotal) {
    const deadBranches = [];
    walk.simple(ast, {
      IfStatement(node) {
        const tag = `L${node.loc?.start?.line ?? 0}_T`;
        if ((branchHitsTotal[tag] || 0) === 0 && !node.alternate) {
          const text = code.slice(node.start, node.end);
          if (!text.includes('reproduce') && text.length < 280) {
            deadBranches.push(node);
          }
        }
      }
    });
    if (deadBranches.length > 0) {
      const victim = deadBranches[0];
      const next = code.slice(0, victim.start) + `/* [剪枝休眠分支以节省算力] */` + code.slice(victim.end);
      return {
        key: 'dead_branch_prune',
        code: next,
        trigger: 'ZERO_HIT_BRANCH_PRUNING',
        reason: `剖析执行探针发现第 ${victim.loc?.start?.line} 行分支长期 0 命中，主动裁剪冗余代码降低 AST 体积与代谢`,
        hypothesis: '精简未激活代码路径可降低单刻算力开销并缩小细胞基础维持能耗',
        memeTag: null
      };
    }
  }

  return null;
}

function buildBugRepairCandidate(code, ast, lastError) {
  const body = findTopLevelFunctionBody(ast, 'decide');
  if (!body) return null;
  const inner = code.slice(body.start + 1, body.end - 1);
  if (inner.includes('try {')) return null;

  const repaired =
    code.slice(0, body.start + 1) +
    `\n  // [自我修复: 针对运行时异常 (${lastError.type}) 注入容错保护]\n  try {\n${inner}\n  } catch (_err) {\n    return { type: 'rest' };\n  }\n` +
    code.slice(body.end - 1);

  return {
    key: 'bug_repair',
    code: repaired,
    trigger: `RUNTIME_ERROR_RECOVERY:${lastError.type}`,
    reason: `捕获自身代码运行异常 (${lastError.message})，自主包裹容错防护网防止神经崩溃死亡`,
    hypothesis: '建立异常熔断捕获机制后，即使极端边界传感缺失也能安全降级维持生命体征',
    memeTag: null
  };
}

function buildByCapabilityKey(capKey, code, ast, caps, traits, telemetry) {
  switch (capKey) {
    case 'hasToxinMemory':
      return buildToxinMemoryCandidate(code, ast, caps, traits);
    case 'hasCoopCrystal':
      return buildCoopCrystalCandidate(code, ast, caps);
    case 'hasShelterLogic':
      return buildClimateShelterCandidate(code, ast, caps);
    case 'hasPhotosynthesis':
      return buildPhotosynthesisCandidate(code, ast, caps);
    case 'hasCacheLogic':
      return buildEnergyCacheCandidate(code, ast, caps);
    case 'hasShareEnergy':
      return buildKinAltruismCandidate(code, ast, caps);
    case 'hasDefend':
      return buildDefenseEvasionCandidate(code, ast, caps);
    case 'hasScavenge':
      return buildScavengeOrPredationCandidate(code, ast, caps, traits, telemetry);
    default:
      return null;
  }
}

/**
 * Counterfactual Mental Simulation:
 * Compiles candidate genome inside the strict VM sandbox and replays the organism's
 * recent experience frames to verify safety, gas budget, and behavioral improvement.
 */
function evaluateCandidateOnReplay(candidate, currentCompiled, experienceFrames = [], rng) {
  let compiled;
  try {
    compiled = compileGenome(candidate.code, { organismId: 'mental_sim' });
  } catch (err) {
    return { valid: false, error: err.message, score: -9999 };
  }

  if (!experienceFrames || experienceFrames.length === 0) {
    return {
      valid: true,
      compiled,
      score: 40,
      avgGas: compiled.nodeCount * 0.25,
      improvedFrames: 0
    };
  }

  let totalCandGas = 0;
  let totalOrigGas = 0;
  let errorCount = 0;
  let improvedFrames = 0;

  for (const frame of experienceFrames.slice(-6)) {
    totalOrigGas += frame.gasUsed || 20;
    const sim = executeGenomeStep(compiled, frame.sensors, frame.memory, { rng });
    totalCandGas += sim.gasUsed;
    if (!sim.ok) {
      errorCount += 1;
      continue;
    }

    const oldAct = frame.action?.type || 'rest';
    const newAct = sim.action?.type || 'rest';

    // Reward switching away from passive/harmful frames to adaptive actions
    if (frame.hpDelta < 0 || frame.energyDelta <= 0) {
      if (
        newAct !== oldAct &&
        ['cooperateHarvest', 'photosynthesize', 'defend', 'buildStructure', 'shareEnergy', 'eat', 'withdrawEnergy'].includes(newAct)
      ) {
        improvedFrames += 1;
      }
      if (frame.sensors?.self?.lastDamageCause === 'toxin' && newAct === 'move') {
        improvedFrames += 1;
      }
    } else if (newAct === 'cooperateHarvest' && oldAct !== 'cooperateHarvest') {
      improvedFrames += 1;
    }
  }

  if (errorCount > 0) {
    return { valid: false, error: `心理沙盘回放发生 ${errorCount} 次运行时异常`, score: -500 };
  }

  const n = Math.min(6, experienceFrames.length);
  const avgCandGas = totalCandGas / n;
  const avgOrigGas = totalOrigGas / n;
  const gasBonus = (avgOrigGas - avgCandGas) * 0.2;
  const score = 35 + improvedFrames * 24 + gasBonus;

  return {
    valid: true,
    compiled,
    score: Number(score.toFixed(2)),
    avgGas: Number(avgCandGas.toFixed(1)),
    improvedFrames
  };
}

/**
 * Main entry point: Synthesize a causally motivated code modification for an organism.
 */
export function synthesizeSelfModification(organismContext, options = {}) {
  const {
    code,
    telemetry,
    traits,
    experienceFrames,
    sensorsSnapshot,
    branchHitsTotal,
    mentorHint = '',
    forceExplore = false
  } = organismContext;
  const rng = options.rng || Math.random;

  let currentCompiled;
  try {
    currentCompiled = compileGenome(code, { organismId: organismContext.id || 'cur' });
  } catch {
    return null;
  }

  const { capabilities } = extractPhenotype(code, currentCompiled);
  const mentor = parseMentorIntent(mentorHint);
  const candidates = [];

  // 1) Bug repair takes top priority if recent execution errors occurred
  if (telemetry.lastError) {
    const c = buildBugRepairCandidate(code, currentCompiled.ast, telemetry.lastError);
    if (c) candidates.push({ ...c, priorityWeight: 100 });
  }

  // 2) Cultural Meme Adoption: if organism heard a peer's successful meme it lacks
  const heardMemes = sensorsSnapshot?.memes || [];
  for (const meme of heardMemes) {
    if (meme.capabilityKey && !capabilities[meme.capabilityKey]) {
      const c = buildByCapabilityKey(meme.capabilityKey, code, currentCompiled.ast, capabilities, traits, telemetry);
      if (c) {
        c.trigger = `CULTURAL_MEME_FROM_${meme.fromId}`;
        c.reason = `倾听并习得高适应度邻伴 (${meme.fromId}) 广播的文化代码模因「${meme.capabilityKey}」，将其融入自身源码`;
        c.hypothesis = `跨血缘复用已被验证的邻伴源码模因，可快速获取生存优势`;
        candidates.push({ ...c, priorityWeight: 55 + (traits.sociability || 0.5) * 20 });
      }
    }
  }

  // 3) Causal environmental & stress-driven synthesis
  if (
    !capabilities.hasToxinMemory &&
    (telemetry.damageByCause.toxin > 0 ||
      mentor.wantsToxin ||
      (sensorsSnapshot?.resources || []).some((r) => r.kind === 'spore'))
  ) {
    const c = buildToxinMemoryCandidate(code, currentCompiled.ast, capabilities, traits);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsToxin ? 95 : telemetry.damageByCause.toxin > 0 ? 85 : 42 });
  }

  if (
    !capabilities.hasCoopCrystal &&
    (telemetry.sawCrystalTicks >= 2 ||
      telemetry.failedCrystalSolo >= 1 ||
      sensorsSnapshot?.env?.biome === 'canyon' ||
      mentor.wantsCrystal)
  ) {
    const c = buildCoopCrystalCandidate(code, currentCompiled.ast, capabilities);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsCrystal ? 95 : telemetry.failedCrystalSolo > 0 ? 82 : 48 });
  }

  if (
    !capabilities.hasShelterLogic &&
    (telemetry.damageByCause.acidRain > 0 ||
      telemetry.damageByCause.cold > 0 ||
      telemetry.sawPressureDrop > 0 ||
      (sensorsSnapshot?.env?.temperature ?? 20) < 9 ||
      mentor.wantsShelter)
  ) {
    const c = buildClimateShelterCandidate(code, currentCompiled.ast, capabilities);
    if (c) {
      const stress = (telemetry.damageByCause.acidRain || 0) + (telemetry.damageByCause.cold || 0);
      candidates.push({ ...c, priorityWeight: mentor.wantsShelter ? 95 : stress > 0 ? 84 : 46 });
    }
  }

  if (
    !capabilities.hasPhotosynthesis &&
    ((sensorsSnapshot?.env?.sunlight ?? 0) >= 0.45 || telemetry.hungryTicks >= 4 || mentor.wantsPhoto)
  ) {
    const c = buildPhotosynthesisCandidate(code, currentCompiled.ast, capabilities);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsPhoto ? 95 : telemetry.hungryTicks >= 6 ? 68 : 44 });
  }

  if (
    !capabilities.hasCacheLogic &&
    (telemetry.highEnergyTicks >= 8 || mentor.wantsCache)
  ) {
    const c = buildEnergyCacheCandidate(code, currentCompiled.ast, capabilities);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsCache ? 92 : 38 });
  }

  if (
    !capabilities.hasShareEnergy &&
    (mentor.wantsShare || ((traits.sociability || 0.5) >= 0.48 && (sensorsSnapshot?.peers || []).some((p) => p.kinship >= 0.3)))
  ) {
    const c = buildKinAltruismCandidate(code, currentCompiled.ast, capabilities);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsShare ? 92 : 45 });
  }

  if (
    !capabilities.hasDefend &&
    (telemetry.damageByCause.attack > 0 || telemetry.sawAttacker > 0 || mentor.wantsDefend)
  ) {
    const c = buildDefenseEvasionCandidate(code, currentCompiled.ast, capabilities);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsDefend ? 94 : 86 });
  }

  if (
    mentor.wantsScavenge ||
    mentor.wantsAttack ||
    (!capabilities.hasScavenge && (sensorsSnapshot?.resources || []).some((r) => r.kind === 'detritus')) ||
    (!capabilities.hasAttack && (traits.aggression || 0) >= 0.64 && telemetry.hungryTicks >= 9)
  ) {
    const c = buildScavengeOrPredationCandidate(code, currentCompiled.ast, capabilities, traits, telemetry);
    if (c) candidates.push({ ...c, priorityWeight: mentor.wantsAttack || mentor.wantsScavenge ? 90 : 48 });
  }

  // 4) Metabolic tuning / meme broadcast / pruning (always available as fallback or exploratory)
  const metaCand = buildMemeBroadcastOrParameterTune(code, currentCompiled.ast, capabilities, telemetry, branchHitsTotal, rng);
  if (metaCand) {
    candidates.push({ ...metaCand, priorityWeight: mentor.wantsOptimize || mentor.wantsMeme ? 88 : 24 });
  }

  // 5) High-curiosity / forced exploration: allow synthesizing an unacquired ecological trait as a bold experiment
  if (candidates.length === 0 || forceExplore || ((traits.curiosity || 0.5) > 0.68 && rng() < 0.16)) {
    const allKeys = ['hasPhotosynthesis', 'hasToxinMemory', 'hasCoopCrystal', 'hasShelterLogic', 'hasShareEnergy', 'hasScavenge'];
    const missing = allKeys.filter((k) => !capabilities[k]);
    if (missing.length > 0) {
      const pick = missing[Math.floor(rng() * missing.length)];
      const expCand = buildByCapabilityKey(pick, code, currentCompiled.ast, capabilities, traits, telemetry);
      if (expCand) {
        expCand.trigger = forceExplore ? 'PLAYER_MENTOR_EXPERIMENT' : 'HIGH_CURIOSITY_EXPLORATION';
        expCand.reason = mentorHint
          ? `响应创造者导师启示「${mentorHint}」，主动尝试编写新行为模块 (${expCand.key})`
          : `受高好奇心神经调质驱动，对未知生态策略 (${expCand.key}) 发起探索性自我编程`;
        candidates.push({ ...expCand, priorityWeight: forceExplore ? 78 : 50 });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Evaluate every candidate in sandbox mental replay
  const evaluated = [];
  for (const cand of candidates) {
    if (cand.code === code) continue;
    const sim = evaluateCandidateOnReplay(cand, currentCompiled, experienceFrames, rng);
    if (sim.valid) {
      evaluated.push({
        candidate: cand,
        sim,
        totalScore: sim.score + (cand.priorityWeight || 0)
      });
    }
  }

  if (evaluated.length === 0) return null;
  evaluated.sort((a, b) => b.totalScore - a.totalScore);
  const winner = evaluated[0];

  const diffPatch = createTwoFilesPatch(
    'genome_prev.js',
    'genome_next.js',
    code,
    winner.candidate.code,
    '',
    '',
    { context: 3 }
  );

  return {
    source: mentorHint ? 'MENTOR_GUIDED_AST' : 'SELF_AST_SYNTHESIS',
    newCode: winner.candidate.code,
    compiled: winner.sim.compiled,
    trigger: winner.candidate.trigger,
    reason: mentorHint
      ? `导师启示「${mentorHint}」→ ${winner.candidate.reason}`
      : winner.candidate.reason,
    hypothesis: winner.candidate.hypothesis,
    replayScore: winner.sim.score,
    improvedFrames: winner.sim.improvedFrames,
    diffPatch,
    memeTag: winner.candidate.memeTag
  };
}
