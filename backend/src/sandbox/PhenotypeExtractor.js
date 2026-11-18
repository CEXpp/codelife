import * as walk from 'acorn-walk';

/**
 * Inspects an organism's real AST and source code to derive:
 * - Verifiable capability flags (no fake traits: derived strictly from code structure)
 * - Procedural morphology descriptor (`phenotype`) for rendering
 * - Deterministic `speciesSignature` & readable `speciesName`
 */
export function extractPhenotype(code, compiledMeta = {}, traitsSeed = 0) {
  const identifiers = new Set();
  const stringLiterals = new Set();

  if (compiledMeta.ast) {
    walk.full(compiledMeta.ast, (node) => {
      if (node.type === 'Identifier') {
        identifiers.add(node.name);
      } else if (node.type === 'Literal' && typeof node.value === 'string') {
        stringLiterals.add(node.value);
      }
    });
  } else {
    // Fallback token match if AST not supplied
    const tokens = code.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    for (const t of tokens) identifiers.add(t);
    const strs = code.match(/["'`]([^"'`]+)["'`]/g) || [];
    for (const s of strs) stringLiterals.add(s.slice(1, -1));
  }

  const hasStr = (s) => stringLiterals.has(s) || code.includes(`'${s}'`) || code.includes(`"${s}"`);
  const hasId = (id) => identifiers.has(id);

  const capabilities = {
    hasPhotosynthesis: hasStr('photosynthesize'),
    hasCoopCrystal: hasStr('cooperateHarvest') || (hasId('crystal') && hasStr('CRYSTAL_CALL')),
    hasSignalBroadcast: hasStr('broadcast') || hasStr('broadcastMeme') || hasId('signal'),
    hasSignalListen: hasId('signals') || hasId('memes'),
    hasToxinMemory: hasId('toxicHues') || hasStr('TOXIN_WARN'),
    hasShelterLogic: hasStr('buildStructure') || hasStr('shelter') || hasId('safeHaven'),
    hasCacheLogic: hasStr('cache') || hasStr('storeEnergy') || hasStr('withdrawEnergy'),
    hasAttack: hasStr('attack'),
    hasDefend: hasStr('defend') || hasStr('flee') || hasStr('DANGER'),
    hasShareEnergy: hasStr('shareEnergy'),
    hasScavenge: hasStr('detritus'),
    hasMemeShare: hasStr('broadcastMeme') || hasId('memes')
  };

  const traits = [];
  if (capabilities.hasPhotosynthesis) traits.push('光合自养');
  if (capabilities.hasCoopCrystal) traits.push('声波协晶');
  if (capabilities.hasToxinMemory) traits.push('识毒记忆');
  if (capabilities.hasShelterLogic) traits.push('避险筑巢');
  if (capabilities.hasCacheLogic) traits.push('储粮窖藏');
  if (capabilities.hasShareEnergy) traits.push('亲缘互助');
  if (capabilities.hasSignalBroadcast) traits.push('信号通信');
  if (capabilities.hasMemeShare) traits.push('文化模因');
  if (capabilities.hasAttack) traits.push('主动掠食');
  if (capabilities.hasDefend) traits.push('威胁防御');
  if (capabilities.hasScavenge) traits.push('腐食清道');
  if (traits.length === 0) traits.push('基础趋食');

  // Bitmask for deterministic species signature
  const bits = [
    capabilities.hasPhotosynthesis ? 'P' : '',
    capabilities.hasCoopCrystal ? 'C' : '',
    capabilities.hasToxinMemory ? 'T' : '',
    capabilities.hasShelterLogic ? 'S' : '',
    capabilities.hasShareEnergy ? 'K' : '',
    capabilities.hasAttack ? 'A' : '',
    capabilities.hasDefend ? 'D' : '',
    capabilities.hasMemeShare ? 'M' : '',
    capabilities.hasCacheLogic ? 'H' : '',
    capabilities.hasScavenge ? 'V' : ''
  ].filter(Boolean);

  const speciesSignature = bits.length === 0 ? 'GEN0-PRIMITIVE' : `EVO-${bits.join('')}`;
  const speciesName = deriveSpeciesName(capabilities, bits);

  // Derive procedural bioluminescent morphology directly from AST capabilities & structural complexity
  const astNodes = compiledMeta.nodeCount || 80;
  const branchCount = compiledMeta.branchCount || 4;
  const complexityFactor = Math.min(1.6, 0.75 + astNodes / 260);

  let primaryHue = 192; // Default deep-ocean cyan
  if (capabilities.hasAttack && !capabilities.hasShareEnergy) {
    primaryHue = 350; // Crimson predator
  } else if (capabilities.hasPhotosynthesis && capabilities.hasShareEnergy) {
    primaryHue = 150; // Emerald symbiotic
  } else if (capabilities.hasPhotosynthesis) {
    primaryHue = 138; // Chloro green-teal
  } else if (capabilities.hasCoopCrystal) {
    primaryHue = 268; // Resonance violet-indigo
  } else if (capabilities.hasToxinMemory) {
    primaryHue = 42; // Amber chemical sentinel
  } else if (capabilities.hasShelterLogic) {
    primaryHue = 208; // Sapphire architect
  } else {
    primaryHue = (186 + (traitsSeed % 28)) % 360;
  }

  const secondaryHue = capabilities.hasMemeShare
    ? 52
    : capabilities.hasCoopCrystal
      ? 185
      : (primaryHue + 48) % 360;

  const phenotype = {
    primaryHue,
    secondaryHue,
    baseRadius: Number((10 + Math.min(8, astNodes / 55)).toFixed(2)),
    complexityFactor: Number(complexityFactor.toFixed(2)),
    wingSize: capabilities.hasPhotosynthesis ? 1.0 : 0,
    crystalHalo: capabilities.hasCoopCrystal ? 1.0 : 0,
    antennaCount:
      (capabilities.hasSignalBroadcast ? 2 : 0) +
      (capabilities.hasSignalListen ? 1 : 0) +
      (capabilities.hasMemeShare ? 1 : 0),
    spikeLevel: capabilities.hasAttack ? 1.0 : capabilities.hasDefend ? 0.55 : 0,
    shellStrength: capabilities.hasShelterLogic ? 0.9 : capabilities.hasDefend ? 0.5 : 0.15,
    altruismGlow: capabilities.hasShareEnergy ? 1.0 : 0,
    toxinFilterRing: capabilities.hasToxinMemory ? 1.0 : 0,
    branchCount
  };

  return {
    capabilities,
    traits,
    speciesSignature,
    speciesName,
    phenotype
  };
}

function deriveSpeciesName(cap, bits) {
  const activeCount = bits.length;
  const codeTag = bits.join('');
  if (activeCount === 0) return '原初微粒 (Gen-0)';
  if (activeCount >= 5) return `深渊智核·${codeTag}`;
  if (cap.hasAttack && cap.hasDefend) return `赤颚猎手·${codeTag}`;
  if (cap.hasAttack) return `暗涌捕食者·${codeTag}`;
  if (cap.hasCoopCrystal && cap.hasMemeShare) return `共鸣传薪族·${codeTag}`;
  if (cap.hasCoopCrystal && cap.hasSignalBroadcast) return `谐振协晶体·${codeTag}`;
  if (cap.hasPhotosynthesis && cap.hasShelterLogic) return `晨曦筑巢者·${codeTag}`;
  if (cap.hasPhotosynthesis && cap.hasShareEnergy) return `绿翼共生体·${codeTag}`;
  if (cap.hasPhotosynthesis) return `叶绿浮游体·${codeTag}`;
  if (cap.hasToxinMemory && cap.hasSignalBroadcast) return `净界哨兵·${codeTag}`;
  if (cap.hasToxinMemory) return `识毒漫游者·${codeTag}`;
  if (cap.hasShelterLogic && cap.hasCacheLogic) return `冬眠窖守者·${codeTag}`;
  if (cap.hasShelterLogic) return `热泉栖居体·${codeTag}`;
  if (cap.hasShareEnergy) return `血缘守望体·${codeTag}`;
  if (cap.hasScavenge) return `深海清道夫·${codeTag}`;
  if (cap.hasDefend) return `警觉游弋体·${codeTag}`;
  return `演化变种·${codeTag}`;
}
