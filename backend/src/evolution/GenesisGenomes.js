/**
 * Genesis Genomes (Gen 0) and Sandbox API Specification.
 * Gen 0 organisms ONLY possess minimal foraging, energy-based reproduction,
 * and wandering persistence. Advanced survival, social, ecological, and cognitive
 * abilities are NOT pre-programmed into Gen 0 — they emerge via AST self-programming
 * or LLM synthesis in response to real environmental feedback.
 */

export const GENESIS_GENOME_CODE = `// CodeLife Gen-0 原初基因程序
// 仅含基础趋食、能量繁殖与探索游动，无预设高级能力
const GENE = {
  reproEnergy: 126,
  forageSpeed: 0.92,
  wanderSpeed: 0.62,
  wanderTurn: 0.42
};

function perceive(sensors, memory, utils) {
  let nearestNectar = null;
  let minDist = 99999;
  const res = sensors.resources || [];
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.kind === 'nectar' && r.dist < minDist) {
      minDist = r.dist;
      nearestNectar = r;
    }
  }
  return {
    food: nearestNectar,
    foodDist: minDist,
    hungry: sensors.energy < 85
  };
}

function decide(p, sensors, memory, utils) {
  if (sensors.energy >= GENE.reproEnergy && sensors.hp > 45) {
    return { type: 'reproduce' };
  }

  if (p.food) {
    const angle = utils.angleTo(sensors.x, sensors.y, p.food.x, p.food.y);
    return {
      type: 'eat',
      targetId: p.food.id,
      angle: angle,
      speed: GENE.forageSpeed
    };
  }

  if (typeof memory.heading !== 'number') {
    memory.heading = utils.rand() * Math.PI * 2;
  }
  memory.heading = utils.normAngle(memory.heading + (utils.rand() - 0.5) * GENE.wanderTurn);
  return {
    type: 'move',
    angle: memory.heading,
    speed: GENE.wanderSpeed
  };
}
`;

export const SANDBOX_API_SPEC = `
# CodeLife 基因编程接口规范
必须定义顶层函数:
- function perceive(sensors, memory, utils) -> 返回感知摘要对象 p
- function decide(p, sensors, memory, utils) -> 返回动作对象

## sensors (只读环境传感)
- sensors.x, sensors.y, sensors.energy, sensors.maxEnergy, sensors.hp, sensors.maxHp, sensors.age
- sensors.self: { id, generation, speciesSignature, familyId, lastDamageCause, lastDamageAmount }
- sensors.env: { biome ('meadow'|'canyon'|'swamp'|'vents'), season, weather ('clear'|'breeze'|'acidRain'|'meteor'|'coldSnap'), pressureDrop, temperature, sunlight, inShelter, nearHotSpring }
- sensors.resources: [{ id, kind ('nectar'|'spore'|'crystal'|'detritus'), x, y, dist, energyValue, hue, requiresCoop }]
- sensors.peers: [{ id, x, y, dist, energy, hp, kinship (0..1), isAttacking, lastActionType }]
- sensors.structures: [{ id, kind ('hotSpring'|'shelter'|'cache'), x, y, dist, storedEnergy }]
- sensors.signals: [{ fromId, channel, intent, x, y, hue, targetId, kinship, dist }]
- sensors.memes: [{ id, fromId, capabilityKey, fitnessScore }]

## memory (持久化记忆 JSON 对象，上限 4096 bytes)
可自由读写如 memory.toxicHues, memory.safeHaven, memory.heading 等字段。

## utils (只读辅助函数)
- utils.dist(ax, ay, bx, by), utils.angleTo(ax, ay, bx, by), utils.clamp(v, min, max), utils.normAngle(a), utils.rand(), utils.minBy(arr, fn)

## decide 返回动作 (action)
- { type: 'move', angle, speed }
- { type: 'eat', targetId, angle, speed }
- { type: 'cooperateHarvest', targetId, angle, speed, signal?: { channel, intent, x, y, targetId } }
- { type: 'photosynthesize' }
- { type: 'reproduce' }
- { type: 'buildStructure', structureKind: 'shelter' | 'cache' }
- { type: 'storeEnergy', targetId, amount } / { type: 'withdrawEnergy', targetId }
- { type: 'shareEnergy', targetId, amount }
- { type: 'attack', targetId, angle, speed }
- { type: 'defend', angle, speed, signal? }
- { type: 'broadcast', channel, payload: { intent, x, y, hue, targetId } }
- { type: 'broadcastMeme', capabilityKey }
- { type: 'rest' }

## 安全约束
严禁使用 eval/Function/Proxy/Reflect/process/global/constructor/__proto__/prototype 等；每次执行有 600 gas 算力上限，gas 消耗计入真实能量代谢。
`;
