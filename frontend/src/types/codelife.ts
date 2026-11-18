export interface PhenotypeDescriptor {
  primaryHue: number;
  secondaryHue: number;
  baseRadius: number;
  complexityFactor: number;
  wingSize: number;
  crystalHalo: number;
  antennaCount: number;
  spikeLevel: number;
  shellStrength: number;
  altruismGlow: number;
  toxinFilterRing: number;
  branchCount: number;
}

export interface OrganismSummary {
  id: string;
  name: string;
  alive: boolean;
  isAdopted: boolean;
  x: number;
  y: number;
  angle: number;
  energy: number;
  maxEnergy: number;
  hp: number;
  maxHp: number;
  age: number;
  generation: number;
  familyId: string;
  codeVersion: number;
  lastGasUsed: number;
  lastActionType: string;
  isAttacking: boolean;
  isDefending: boolean;
  codeMutatingEffectTicks: number;
  speciesSignature: string;
  speciesName: string;
  traitsList: string[];
  phenotype: PhenotypeDescriptor;
}

export interface CodeCommitValidation {
  status: 'BASELINE' | 'EVALUATING' | 'BENEFICIAL' | 'NEUTRAL' | 'DELETERIOUS' | 'REVERTED_ON_CRASH' | 'FATAL_BUG';
  startTick: number;
  evalTargetTick: number;
  startEnergy: number;
  startHp: number;
  errorsDuringWindow: number;
  summary: string;
}

export interface CodeCommit {
  id: string;
  version: number;
  tick: number;
  source: string;
  trigger: string;
  reason: string;
  hypothesis: string;
  diffPatch: string;
  codeSnapshot: string;
  speciesBefore: string;
  speciesAfter: string;
  replayScore: number | null;
  validation: CodeCommitValidation;
}

export interface EpisodeEvent {
  tick: number;
  kind: string;
  text: string;
}

export interface OrganismDetail extends OrganismSummary {
  birthTick: number;
  deathTick: number | null;
  causeOfDeath: string | null;
  parentIds: string[];
  childrenIds: string[];
  personality: {
    curiosity: number;
    caution: number;
    sociability: number;
    aggression: number;
    resilience: number;
  };
  avgGas: number;
  gasLimit: number;
  astNodeCount: number;
  branchCount: number;
  branchLines: Record<string, { line: number; kind: string; preview: string }>;
  lastBranchHits: Record<string, number>;
  branchHitsTotal: Record<string, number>;
  code: string;
  memory: Record<string, unknown>;
  lastAction: Record<string, unknown>;
  lastPerception: Record<string, unknown>;
  lastSensorsSummary: Record<string, unknown> | null;
  telemetry: {
    damageByCause: Record<string, number>;
    sawCrystalTicks: number;
    failedCrystalSolo: number;
    sawPressureDrop: number;
    hungryTicks: number;
    highEnergyTicks: number;
    sawAttacker: number;
    lastError: { type: string; message: string } | null;
    consecutiveErrors: number;
    ticksSinceLastCodeEdit: number;
    totalCodeEdits: number;
    coopCount: number;
    eatCount: number;
    memesShared: number;
  };
  episodicLog: EpisodeEvent[];
  codeCommits: CodeCommit[];
  capabilities: Record<string, boolean>;
}

export interface WorldResource {
  id: string;
  kind: 'nectar' | 'spore' | 'crystal' | 'detritus';
  x: number;
  y: number;
  energyValue: number;
  hue: number;
  requiresCoop: boolean;
}

export interface WorldStructure {
  id: string;
  kind: 'hotSpring' | 'shelter' | 'cache';
  x: number;
  y: number;
  radius: number;
  ownerId: string;
  storedEnergy: number;
}

export interface AcousticSignal {
  id: string;
  fromId: string;
  channel: string;
  intent: string;
  x: number;
  y: number;
  age: number;
}

export interface CulturalMeme {
  id: string;
  fromId: string;
  fromName: string;
  speciesName: string;
  capabilityKey: string;
  fitnessScore: number;
  x: number;
  y: number;
  age: number;
}

export interface Pheromone {
  kind: string;
  x: number;
  y: number;
  intensity: number;
}

export interface ChronicleEvent {
  id: string;
  tick: number;
  kind: string;
  text: string;
  organismId: string | null;
  commitVersion?: number;
}

export interface WorldFrame {
  tick: number;
  epoch: number;
  speedMultiplier: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: 'clear' | 'breeze' | 'acidRain' | 'meteor' | 'coldSnap';
  pressureDrop: boolean;
  temperature: number;
  sunlight: number;
  lastTickDurationMs: number;
  stats: {
    population: number;
    speciesCount: number;
    totalCommits: number;
    cultureCount: number;
    archivedLineageCount: number;
  };
  organisms: OrganismSummary[];
  resources: WorldResource[];
  structures: WorldStructure[];
  signals: AcousticSignal[];
  memes: CulturalMeme[];
  pheromones: Pheromone[];
  chronicleEvents: ChronicleEvent[];
}

export interface BiomeConfig {
  id: string;
  name: string;
  subtitle: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  color: string;
}

export interface PhylogenyNode {
  id: string;
  name: string;
  alive: boolean;
  isAdopted: boolean;
  generation: number;
  birthTick: number;
  deathTick: number | null;
  causeOfDeath: string | null;
  speciesSignature: string;
  speciesName: string;
  codeVersion: number;
  childrenCount: number;
  primaryHue: number;
}

export interface PhylogenyResponse {
  nodes: PhylogenyNode[];
  edges: { from: string; to: string }[];
  speciesDistribution: {
    signature: string;
    name: string;
    count: number;
    hue: number;
    traits: string[];
  }[];
  culturalMemes: {
    capabilityKey: string;
    originatorName: string;
    originatorId: string;
    adoptions: number;
    broadcasts: number;
  }[];
  historySeries: {
    tick: number;
    population: number;
    speciesCount: number;
    totalCommits: number;
    avgAstNodes: number;
    avgEnergy: number;
  }[];
}

export interface LLMConfigState {
  enabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  stats: {
    requestsTotal: number;
    successTotal: number;
    sandboxRejectedTotal: number;
    lastLatencyMs: number | null;
    lastError: string | null;
    inFlightCount: number;
  };
}

export type GodTool =
  | 'observe'
  | 'nectar'
  | 'crystal'
  | 'spore'
  | 'hotSpring'
  | 'acidRain'
  | 'coldSnap'
  | 'seed';

export interface CanvasLayers {
  showBiomes: boolean;
  showVision: boolean;
  showSignals: boolean;
  showKinLinks: boolean;
}
