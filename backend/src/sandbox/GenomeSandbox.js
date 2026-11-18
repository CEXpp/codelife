import vm from 'node:vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export const MAX_GENOME_LENGTH = 24000;
export const MAX_AST_NODES = 1800;
export const DEFAULT_GAS_LIMIT = 600;
export const MAX_MEMORY_BYTES = 4096;
export const STEP_TIMEOUT_MS = 10;

const FORBIDDEN_IDENTIFIERS = new Set([
  'process',
  'global',
  'globalThis',
  'Buffer',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'eval',
  'Function',
  'AsyncFunction',
  'GeneratorFunction',
  'AsyncGeneratorFunction',
  'Proxy',
  'Reflect',
  'WebAssembly',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'console',
  'Atomics',
  'SharedArrayBuffer',
  'FinalizationRegistry',
  'WeakRef',
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__gas',
  '__branch',
  '__safeKey',
  'arguments'
]);

const FORBIDDEN_NODE_TYPES = new Set([
  'ImportDeclaration',
  'ImportExpression',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'WithStatement',
  'DebuggerStatement',
  'AwaitExpression',
  'YieldExpression',
  'MetaProperty',
  'ClassDeclaration',
  'ClassExpression',
  'LabeledStatement',
  'ThisExpression',
  'Super'
]);

export class SandboxCompileError extends Error {
  constructor(message, code = 'COMPILE_ERROR') {
    super(message);
    this.name = 'SandboxCompileError';
    this.code = code;
  }
}

export class GasExhaustedError extends Error {
  constructor(gasUsed, limit) {
    super(`算力耗尽 (${gasUsed}/${limit} ops)`);
    this.name = 'GasExhaustedError';
    this.code = 'GAS_EXHAUSTED';
    this.gasUsed = gasUsed;
    this.limit = limit;
  }
}

export class MemoryLimitError extends Error {
  constructor(bytes, limit) {
    super(`工作记忆超限 (${bytes}/${limit} bytes)`);
    this.name = 'MemoryLimitError';
    this.code = 'MEMORY_EXHAUSTED';
  }
}

/**
 * Validate AST for safety, disallowed syntax, forbidden identifiers, and size caps.
 * Returns { ast, nodeCount, branchCount, loopCount, hasPerceive, hasDecide }
 */
export function auditGenomeAST(code) {
  if (typeof code !== 'string') {
    throw new SandboxCompileError('基因源码必须为字符串');
  }
  if (code.length > MAX_GENOME_LENGTH) {
    throw new SandboxCompileError(`基因源码超过最大长度限制 (${code.length}/${MAX_GENOME_LENGTH})`);
  }

  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      locations: true,
      allowReturnOutsideFunction: false
    });
  } catch (err) {
    throw new SandboxCompileError(`语法解析失败: ${err.message}`, 'SYNTAX_ERROR');
  }

  let nodeCount = 0;
  let branchCount = 0;
  let loopCount = 0;
  let hasPerceive = false;
  let hasDecide = false;

  // Check top-level bindings for perceive & decide
  for (const stmt of ast.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      if (stmt.id.name === 'perceive') hasPerceive = true;
      if (stmt.id.name === 'decide') hasDecide = true;
    } else if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (
          decl.id?.type === 'Identifier' &&
          decl.init &&
          (decl.init.type === 'FunctionExpression' || decl.init.type === 'ArrowFunctionExpression')
        ) {
          if (decl.id.name === 'perceive') hasPerceive = true;
          if (decl.id.name === 'decide') hasDecide = true;
        }
      }
    }
  }

  if (!hasPerceive || !hasDecide) {
    throw new SandboxCompileError('基因必须包含顶层函数 perceive(sensors, memory, utils) 与 decide(p, sensors, memory, utils)');
  }

  walk.full(ast, (node) => {
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) {
      throw new SandboxCompileError(`AST 复杂度超限 (${nodeCount}/${MAX_AST_NODES} 节点)`);
    }

    if (FORBIDDEN_NODE_TYPES.has(node.type)) {
      throw new SandboxCompileError(`禁止使用的语法结构: ${node.type}`, 'FORBIDDEN_SYNTAX');
    }

    if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression') &&
      (node.async || node.generator)
    ) {
      throw new SandboxCompileError('基因函数禁止使用 async 或 generator', 'FORBIDDEN_SYNTAX');
    }

    if (node.type === 'Identifier') {
      if (FORBIDDEN_IDENTIFIERS.has(node.name)) {
        throw new SandboxCompileError(`禁止访问受限标识符: ${node.name}`, 'FORBIDDEN_IDENTIFIER');
      }
    }

    if (node.type === 'MemberExpression' && !node.computed && node.property) {
      const propName = node.property.name || node.property.value;
      if (FORBIDDEN_IDENTIFIERS.has(propName)) {
        throw new SandboxCompileError(`禁止访问受限属性: ${propName}`, 'FORBIDDEN_KEY');
      }
    }

    if (node.type === 'Property' && !node.computed && node.key) {
      const keyName = node.key.name ?? node.key.value;
      if (
        keyName === 'constructor' ||
        keyName === '__proto__' ||
        keyName === 'prototype'
      ) {
        throw new SandboxCompileError(`禁止声明原型属性键: ${keyName}`, 'FORBIDDEN_KEY');
      }
    }

    if (node.type === 'Literal') {
      if (typeof node.value === 'string' && FORBIDDEN_IDENTIFIERS.has(node.value)) {
        // Allow harmless strings except prototype keys? Wait: what if someone writes "constructor"?
        if (
          node.value === 'constructor' ||
          node.value === '__proto__' ||
          node.value === 'prototype'
        ) {
          throw new SandboxCompileError(`禁止出现原型键字面量: ${node.value}`, 'FORBIDDEN_KEY');
        }
      }
      if (node.regex && node.regex.pattern.length > 64) {
        throw new SandboxCompileError('正则表达式长度超限', 'FORBIDDEN_SYNTAX');
      }
    }

    if (node.type === 'ObjectPattern') {
      for (const prop of node.properties) {
        if (prop.computed) {
          throw new SandboxCompileError('禁止在解构模式中使用计算属性键', 'FORBIDDEN_SYNTAX');
        }
      }
    }

    if (node.type === 'IfStatement') {
      branchCount += 1;
    }

    if (
      node.type === 'ForStatement' ||
      node.type === 'WhileStatement' ||
      node.type === 'DoWhileStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement'
    ) {
      loopCount += 1;
    }
  });

  return { ast, nodeCount, branchCount, loopCount, hasPerceive, hasDecide };
}

/**
 * Point-insertion AST instrumentation:
 * - Computed MemberExpression & computed ObjectExpression property keys wrapped with __safeKey(...)
 * - Function bodies & loops instrumented with __gas(1)
 * - IfStatement branches instrumented with __branch("L<line>_T" / "L<line>_F")
 */
export function instrumentGenome(code, ast) {
  const insertions = [];
  const lines = code.split('\n');

  const addWrap = (start, end, prefix, suffix) => {
    const span = end - start;
    insertions.push({ pos: start, isClose: false, span, text: prefix });
    insertions.push({ pos: end, isClose: true, span, text: suffix });
  };

  const addPoint = (pos, span, text) => {
    insertions.push({ pos, isClose: false, span, text });
  };

  const instrumentStatementBody = (stmtNode, injectedCall) => {
    if (!stmtNode) return;
    if (stmtNode.type === 'BlockStatement') {
      addPoint(stmtNode.start + 1, stmtNode.end - stmtNode.start, ` ${injectedCall} `);
    } else {
      addWrap(stmtNode.start, stmtNode.end, `{ ${injectedCall} `, ' }');
    }
  };

  walk.simple(ast, {
    MemberExpression(node) {
      if (node.computed && node.property) {
        addWrap(node.property.start, node.property.end, '__safeKey(', ')');
      }
    },
    Property(node) {
      if (node.computed && node.key) {
        addWrap(node.key.start, node.key.end, '__safeKey(', ')');
      }
    },
    FunctionDeclaration(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    FunctionExpression(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    ArrowFunctionExpression(node) {
      if (node.body.type === 'BlockStatement') {
        instrumentStatementBody(node.body, '__gas(1);');
      } else {
        addWrap(node.body.start, node.body.end, '(__gas(1), (', '))');
      }
    },
    ForStatement(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    WhileStatement(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    DoWhileStatement(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    ForInStatement(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    ForOfStatement(node) {
      instrumentStatementBody(node.body, '__gas(1);');
    },
    IfStatement(node) {
      const lineNum = node.loc?.start?.line ?? 0;
      const tagT = `L${lineNum}_T`;
      const tagF = `L${lineNum}_F`;
      instrumentStatementBody(node.consequent, `__branch(${JSON.stringify(tagT)});`);
      if (node.alternate) {
        instrumentStatementBody(node.alternate, `__branch(${JSON.stringify(tagF)});`);
      }
    }
  });

  // Sort ascending:
  // 1) pos ascending
  // 2) closing insertions before opening insertions at the same pos
  // 3) closing insertions: smaller span closes first
  // 4) opening insertions: larger span opens first
  insertions.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.isClose !== b.isClose) return a.isClose ? -1 : 1;
    if (a.isClose) return a.span - b.span;
    return b.span - a.span;
  });

  let instrumented = '';
  let cursor = 0;
  for (const ins of insertions) {
    instrumented += code.slice(cursor, ins.pos) + ins.text;
    cursor = ins.pos;
  }
  instrumented += code.slice(cursor);

  // Build branch line map for frontend profiler overlay
  const branchLines = {};
  walk.simple(ast, {
    IfStatement(node) {
      const lineNum = node.loc?.start?.line ?? 0;
      branchLines[`L${lineNum}_T`] = { line: lineNum, kind: 'if', preview: (lines[lineNum - 1] || '').trim() };
      if (node.alternate) {
        const altLine = node.alternate.loc?.start?.line ?? lineNum;
        branchLines[`L${lineNum}_F`] = { line: altLine, kind: 'else', preview: (lines[altLine - 1] || '').trim() };
      }
    }
  });

  return { instrumented, branchLines };
}

function createSafeUtils(rngFn) {
  const utils = {
    dist(ax, ay, bx, by) {
      const dx = (bx || 0) - (ax || 0);
      const dy = (by || 0) - (ay || 0);
      return Math.hypot(dx, dy);
    },
    angleTo(ax, ay, bx, by) {
      return Math.atan2((by || 0) - (ay || 0), (bx || 0) - (ax || 0));
    },
    clamp(val, min, max) {
      const n = Number(val);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    },
    lerp(a, b, t) {
      return a + (b - a) * Math.max(0, Math.min(1, t));
    },
    normAngle(a) {
      let x = a || 0;
      while (x > Math.PI) x -= Math.PI * 2;
      while (x < -Math.PI) x += Math.PI * 2;
      return x;
    },
    rand() {
      return typeof rngFn === 'function' ? rngFn() : Math.random();
    },
    minBy(arr, fn) {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      let best = arr[0];
      let bestScore = fn(best);
      for (let i = 1; i < arr.length; i++) {
        const s = fn(arr[i]);
        if (s < bestScore) {
          bestScore = s;
          best = arr[i];
        }
      }
      return best;
    }
  };
  return Object.freeze(utils);
}

const SAFE_MATH = Object.freeze({
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  atan2: Math.atan2,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  hypot: Math.hypot,
  log: Math.log,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
  PI: Math.PI,
  E: Math.E
});

function sanitizeAction(raw) {
  if (!raw || typeof raw !== 'object') {
    return { type: 'rest', angle: 0, speed: 0 };
  }
  const type = typeof raw.type === 'string' ? raw.type.slice(0, 32) : 'rest';
  const angle = Number.isFinite(raw.angle) ? raw.angle : 0;
  const speed = Number.isFinite(raw.speed) ? Math.max(0, Math.min(1.5, raw.speed)) : 0.6;
  const targetId = typeof raw.targetId === 'string' ? raw.targetId.slice(0, 64) : undefined;
  const structureKind = typeof raw.structureKind === 'string' ? raw.structureKind.slice(0, 32) : undefined;
  const amount = Number.isFinite(raw.amount) ? Math.max(0, Math.min(100, raw.amount)) : undefined;
  const channel = typeof raw.channel === 'string' ? raw.channel.slice(0, 24) : undefined;

  let payload = undefined;
  if (raw.payload && typeof raw.payload === 'object') {
    try {
      const s = JSON.stringify(raw.payload);
      if (s.length <= 256) {
        payload = JSON.parse(s);
      }
    } catch {
      payload = undefined;
    }
  }

  let signal = undefined;
  if (raw.signal && typeof raw.signal === 'object') {
    try {
      const s = JSON.stringify(raw.signal);
      if (s.length <= 256) {
        signal = JSON.parse(s);
      }
    } catch {
      signal = undefined;
    }
  }

  return {
    type,
    angle,
    speed,
    targetId,
    structureKind,
    amount,
    channel,
    payload,
    signal
  };
}

/**
 * Compile and bind a genome into an isolated V8 vm context.
 */
export function compileGenome(code, options = {}) {
  const { ast, nodeCount, branchCount, loopCount } = auditGenomeAST(code);
  const { instrumented, branchLines } = instrumentGenome(code, ast);

  const gasLimit = options.gasLimit ?? DEFAULT_GAS_LIMIT;
  const runtimeState = {
    gasUsed: 0,
    gasLimit,
    branchHits: Object.create(null)
  };

  const sandboxGlobals = Object.create(null);
  sandboxGlobals.Math = SAFE_MATH;
  sandboxGlobals.Number = Number;
  sandboxGlobals.String = String;
  sandboxGlobals.Boolean = Boolean;
  sandboxGlobals.Array = Array;
  sandboxGlobals.Object = Object;
  sandboxGlobals.JSON = JSON;
  sandboxGlobals.isNaN = Number.isNaN;
  sandboxGlobals.isFinite = Number.isFinite;
  sandboxGlobals.parseInt = Number.parseInt;
  sandboxGlobals.parseFloat = Number.parseFloat;

  sandboxGlobals.__gas = (cost = 1) => {
    runtimeState.gasUsed += cost;
    if (runtimeState.gasUsed > runtimeState.gasLimit) {
      throw new GasExhaustedError(runtimeState.gasUsed, runtimeState.gasLimit);
    }
  };

  sandboxGlobals.__branch = (tag) => {
    runtimeState.branchHits[tag] = (runtimeState.branchHits[tag] || 0) + 1;
  };

  sandboxGlobals.__safeKey = (key) => {
    const k = String(key);
    if (
      k === 'constructor' ||
      k === '__proto__' ||
      k === 'prototype' ||
      k === '__defineGetter__' ||
      k === '__defineSetter__' ||
      k === '__lookupGetter__' ||
      k === '__lookupSetter__'
    ) {
      throw new SandboxCompileError(`运行时禁止动态读取受限属性: ${k}`, 'FORBIDDEN_KEY');
    }
    return key;
  };

  const context = vm.createContext(sandboxGlobals, {
    name: `genome_${options.organismId || 'anon'}`,
    codeGeneration: { strings: false, wasm: false }
  });

  const wrappedScript = `
    (function() {
      "use strict";
      ${instrumented}
      return { perceive: perceive, decide: decide };
    })();
  `;

  let compiledPair;
  try {
    const script = new vm.Script(wrappedScript, { filename: 'genome.js' });
    compiledPair = script.runInContext(context, { timeout: STEP_TIMEOUT_MS });
  } catch (err) {
    throw new SandboxCompileError(`沙箱编译运行失败: ${err.message}`, err.code || 'COMPILE_RUNTIME_ERROR');
  }

  if (
    !compiledPair ||
    typeof compiledPair.perceive !== 'function' ||
    typeof compiledPair.decide !== 'function'
  ) {
    throw new SandboxCompileError('perceive 与 decide 必须为可调用函数');
  }

  return {
    code,
    ast,
    nodeCount,
    branchCount,
    loopCount,
    branchLines,
    context,
    runtimeState,
    perceiveFn: compiledPair.perceive,
    decideFn: compiledPair.decide
  };
}

const STEP_RUNNER_SCRIPT = new vm.Script(
  `(() => {
    const p = __perceive(__stepSensors, __stepMemory, __stepUtils);
    return { perception: p, action: __decide(p, __stepSensors, __stepMemory, __stepUtils) };
  })()`,
  { filename: 'genome_step.js' }
);

/**
 * Execute one perceive -> decide step inside the compiled VM sandbox.
 */
export function executeGenomeStep(compiled, sensors, memory, options = {}) {
  const gasLimit = options.gasLimit ?? DEFAULT_GAS_LIMIT;
  compiled.runtimeState.gasUsed = 0;
  compiled.runtimeState.gasLimit = gasLimit;
  compiled.runtimeState.branchHits = Object.create(null);

  const utils = createSafeUtils(options.rng);
  let memClone;
  try {
    memClone = memory ? JSON.parse(JSON.stringify(memory)) : {};
  } catch {
    memClone = {};
  }

  let sensorClone;
  try {
    sensorClone = JSON.parse(JSON.stringify(sensors));
  } catch {
    sensorClone = {};
  }

  compiled.context.__stepSensors = sensorClone;
  compiled.context.__stepMemory = memClone;
  compiled.context.__stepUtils = utils;
  compiled.context.__perceive = compiled.perceiveFn;
  compiled.context.__decide = compiled.decideFn;

  try {
    const res = STEP_RUNNER_SCRIPT.runInContext(compiled.context, { timeout: STEP_TIMEOUT_MS });
    const serializedMem = JSON.stringify(memClone);
    if (serializedMem.length > MAX_MEMORY_BYTES) {
      throw new MemoryLimitError(serializedMem.length, MAX_MEMORY_BYTES);
    }

    let perceptionSummary = {};
    try {
      const pStr = JSON.stringify(res?.perception ?? {});
      perceptionSummary = pStr.length <= 1024 ? JSON.parse(pStr) : { truncated: true };
    } catch {
      perceptionSummary = {};
    }

    return {
      ok: true,
      action: sanitizeAction(res?.action),
      perception: perceptionSummary,
      memory: JSON.parse(serializedMem),
      gasUsed: compiled.runtimeState.gasUsed,
      branchHits: { ...compiled.runtimeState.branchHits },
      error: null
    };
  } catch (err) {
    let errorType = 'RUNTIME_ERROR';
    if (err instanceof GasExhaustedError || err?.code === 'GAS_EXHAUSTED') {
      errorType = 'GAS_EXHAUSTED';
    } else if (err instanceof MemoryLimitError || err?.code === 'MEMORY_EXHAUSTED') {
      errorType = 'MEMORY_EXHAUSTED';
    } else if (String(err?.message || '').includes('timed out')) {
      errorType = 'TIMEOUT';
    } else if (err?.code === 'FORBIDDEN_KEY') {
      errorType = 'SECURITY_VIOLATION';
    }

    return {
      ok: false,
      action: { type: 'rest', angle: 0, speed: 0 },
      perception: {},
      memory: memory || {},
      gasUsed: Math.min(gasLimit, compiled.runtimeState.gasUsed || gasLimit),
      branchHits: { ...compiled.runtimeState.branchHits },
      error: {
        type: errorType,
        message: err?.message || String(err)
      }
    };
  } finally {
    delete compiled.context.__stepSensors;
    delete compiled.context.__stepMemory;
    delete compiled.context.__stepUtils;
    delete compiled.context.__perceive;
    delete compiled.context.__decide;
  }
}
