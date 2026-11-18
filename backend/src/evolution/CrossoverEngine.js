import { createTwoFilesPatch } from 'diff';
import * as walk from 'acorn-walk';
import { compileGenome } from '../sandbox/GenomeSandbox.js';
import { extractPhenotype } from '../sandbox/PhenotypeExtractor.js';
import { synthesizeSelfModification } from './SymbolicASTSynthesizer.js';

function mutateNumericConstant(code, compiledAst, rng) {
  const candidates = [];
  walk.simple(compiledAst, {
    Property(node) {
      if (
        node.key?.type === 'Identifier' &&
        node.value?.type === 'Literal' &&
        typeof node.value.value === 'number' &&
        node.value.value > 0
      ) {
        candidates.push({
          name: node.key.name,
          value: node.value.value,
          start: node.value.start,
          end: node.value.end
        });
      }
    }
  });

  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const deltaFactor = 0.9 + rng() * 0.2;
  let nextVal = Number((pick.value * deltaFactor).toFixed(2));
  if (pick.name === 'reproEnergy') {
    nextVal = Math.max(105, Math.min(150, Math.round(nextVal)));
  } else if (pick.name === 'forageSpeed' || pick.name === 'wanderSpeed') {
    nextVal = Math.max(0.35, Math.min(1.25, nextVal));
  }
  if (nextVal === pick.value) return null;

  const mutatedCode = code.slice(0, pick.start) + String(nextVal) + code.slice(pick.end);
  try {
    const compiled = compileGenome(mutatedCode, { organismId: 'mitosis_mut' });
    return {
      code: mutatedCode,
      compiled,
      note: `有丝分裂微调参数 ${pick.name}: ${pick.value} → ${nextVal}`
    };
  } catch {
    return null;
  }
}

export function inheritEpigeneticMemory(parentA, parentB = null) {
  const mem = {};
  const toxicSet = new Set();
  for (const p of [parentA, parentB].filter(Boolean)) {
    if (Array.isArray(p.memory?.toxicHues)) {
      for (const h of p.memory.toxicHues) toxicSet.add(h);
    }
  }
  if (toxicSet.size > 0) {
    mem.toxicHues = [...toxicSet].slice(0, 12);
  }
  const haven = parentA.memory?.safeHaven || parentB?.memory?.safeHaven;
  if (haven && typeof haven.x === 'number' && typeof haven.y === 'number') {
    mem.safeHaven = { x: haven.x, y: haven.y };
  }
  return mem;
}

export function createAsexualOffspringGenome(parent, rng = Math.random) {
  let childCode = parent.code;
  let compiled = compileGenome(childCode, { organismId: 'child_clone' });
  let trigger = 'ASEXUAL_MITOSIS';
  let reason = `继承亲代 #${parent.id} (v${parent.codeVersion}) 完整基因源码`;
  let diffPatch = '';

  if (rng() < 0.28) {
    const mut = mutateNumericConstant(childCode, compiled.ast, rng);
    if (mut) {
      childCode = mut.code;
      compiled = mut.compiled;
      trigger = 'MITOSIS_MUTATION';
      reason = `分裂复制过程中发生基因常数微变异：${mut.note}`;
      diffPatch = createTwoFilesPatch('parent.js', 'offspring.js', parent.code, childCode, '', '', { context: 2 });
    }
  }

  return {
    code: childCode,
    compiled,
    epigeneticMemory: inheritEpigeneticMemory(parent),
    commitInfo: {
      source: trigger,
      trigger,
      reason,
      hypothesis: '保留亲代已验证生存程序，探索局部参数微调带来的代谢或速度优势',
      diffPatch
    }
  };
}

export function createSexualOffspringGenome(parentA, parentB, rng = Math.random) {
  const fitA = parentA.getFitnessScore ? parentA.getFitnessScore() : parentA.energy;
  const fitB = parentB.getFitnessScore ? parentB.getFitnessScore() : parentB.energy;
  const baseParent = fitA >= fitB ? parentA : parentB;
  const donorParent = fitA >= fitB ? parentB : parentA;

  let childCode = baseParent.code;
  let compiled = compileGenome(childCode, { organismId: 'child_cross' });

  const baseCaps = extractPhenotype(baseParent.code, compiled).capabilities;
  const donorPheno = extractPhenotype(donorParent.code);
  const donorCaps = donorPheno.capabilities;

  const missingFromDonor = [];
  const capKeyToHint = {
    hasToxinMemory: '毒素 孢子',
    hasCoopCrystal: '晶簇 合作 声波',
    hasShelterLogic: '庇护 热泉 寒冬',
    hasPhotosynthesis: '光合作用',
    hasCacheLogic: '储粮 窖藏',
    hasShareEnergy: '分享 互助 伙伴',
    hasDefend: '防御 逃跑',
    hasScavenge: '腐食 碎屑'
  };

  for (const [k, hint] of Object.entries(capKeyToHint)) {
    if (donorCaps[k] && !baseCaps[k]) {
      missingFromDonor.push({ key: k, hint });
    }
  }

  const recombinedTraits = [];
  if (missingFromDonor.length > 0) {
    // Recombine up to 1–2 missing AST organs from donorParent into baseParent
    const count = Math.min(2, missingFromDonor.length);
    for (let i = 0; i < count; i++) {
      const target = missingFromDonor[i];
      const synth = synthesizeSelfModification(
        {
          id: 'crossover_sim',
          code: childCode,
          telemetry: {
            damageByCause: {},
            sawCrystalTicks: 5,
            failedCrystalSolo: 1,
            sawPressureDrop: 1,
            hungryTicks: 8,
            highEnergyTicks: 10,
            sawAttacker: 1,
            avgGas: 20
          },
          traits: baseParent.traits,
          experienceFrames: [],
          sensorsSnapshot: { env: { sunlight: 0.8, temperature: 4 }, resources: [], peers: [], memes: [] },
          branchHitsTotal: {},
          mentorHint: target.hint,
          forceExplore: false
        },
        { rng }
      );
      if (synth && synth.newCode !== childCode) {
        try {
          const testCompiled = compileGenome(synth.newCode, { organismId: 'crossover_check' });
          childCode = synth.newCode;
          compiled = testCompiled;
          recombinedTraits.push(target.key);
        } catch {
          // Keep current valid childCode if recombination exceeds AST limit
        }
      }
    }
  }

  // Also apply minor parameter drift
  if (rng() < 0.35) {
    const mut = mutateNumericConstant(childCode, compiled.ast, rng);
    if (mut) {
      childCode = mut.code;
      compiled = mut.compiled;
    }
  }

  const diffPatch =
    childCode !== baseParent.code
      ? createTwoFilesPatch(
          `${baseParent.id}.js`,
          'offspring_cross.js',
          baseParent.code,
          childCode,
          '',
          '',
          { context: 3 }
        )
      : '';

  const reason =
    recombinedTraits.length > 0
      ? `有性基因交叉重组：以 #${baseParent.id} 为基底，融合 #${donorParent.id} 的进化模块 [${recombinedTraits.join(', ')}]`
      : `有性杂交：融合 #${baseParent.id} 与 #${donorParent.id} 基因常数并继承双亲表观遗传记忆`;

  return {
    code: childCode,
    compiled,
    epigeneticMemory: inheritEpigeneticMemory(parentA, parentB),
    commitInfo: {
      source: 'SEXUAL_CROSSOVER',
      trigger: 'SEXUAL_REPRODUCTION',
      reason,
      hypothesis: '跨个体组合双亲各自演化出的优势 AST 能力模块，产生超越单亲的复合生态位适应力',
      diffPatch
    }
  };
}
