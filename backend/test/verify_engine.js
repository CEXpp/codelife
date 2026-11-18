import assert from 'node:assert/strict';
import { compileGenome, executeGenomeStep, SandboxCompileError } from '../src/sandbox/GenomeSandbox.js';
import { WorldEngine } from '../src/world/WorldEngine.js';

function testSandboxSecurity() {
  console.log('1) 测试四层纵深安全沙箱攻防...');

  // 1.1 Direct process / global access
  assert.throws(
    () => compileGenome('function perceive(){ process.exit(1); return {}; } function decide(){ return {type:"rest"}; }'),
    SandboxCompileError
  );

  // 1.2 Prototype chain constructor escape
  assert.throws(
    () => compileGenome('function perceive(){ return (1).constructor.constructor("return process")(); } function decide(){ return {type:"rest"}; }'),
    SandboxCompileError
  );

  // 1.3 Destructuring computed key
  assert.throws(
    () => compileGenome('function perceive(){ const { ["con"+"structor"]: c } = {}; return {}; } function decide(){ return {type:"rest"}; }'),
    SandboxCompileError
  );

  // 1.4 Computed bracket dynamic prototype access at runtime (__safeKey)
  const dynComp = compileGenome(`
    function perceive(s) {
      const k = "con" + "structor";
      return s[k];
    }
    function decide() { return { type: 'rest' }; }
  `);
  const dynRes = executeGenomeStep(dynComp, { resources: [] }, {});
  assert.equal(dynRes.ok, false);
  assert.equal(dynRes.error.type, 'SECURITY_VIOLATION');

  // 1.5 Infinite while loop halted by gas meter
  const infLoop = compileGenome(`
    function perceive() {
      let i = 0;
      while (true) i++;
      return {};
    }
    function decide() { return { type: 'rest' }; }
  `);
  const t0 = performance.now();
  const loopRes = executeGenomeStep(infLoop, {}, {}, { gasLimit: 600 });
  const elapsed = performance.now() - t0;
  assert.equal(loopRes.ok, false);
  assert.equal(loopRes.error.type, 'GAS_EXHAUSTED');
  assert.ok(elapsed < 30, `死循环熔断耗时过长: ${elapsed}ms`);

  // 1.6 Infinite recursion halted by gas meter before stack overflow
  const infRec = compileGenome(`
    function dive(n) { return dive(n + 1); }
    function perceive() { return dive(0); }
    function decide() { return { type: 'rest' }; }
  `);
  const recRes = executeGenomeStep(infRec, {}, {}, { gasLimit: 300 });
  assert.equal(recRes.ok, false);
  assert.equal(recRes.error.type, 'GAS_EXHAUSTED');

  // 1.7 Memory overflow intercepted
  const memBomb = compileGenome(`
    function perceive(s, memory) {
      let s1 = "x";
      for (let i = 0; i < 13; i++) s1 = s1 + s1;
      memory.blob = s1;
      return {};
    }
    function decide() { return { type: 'rest' }; }
  `);
  const memRes = executeGenomeStep(memBomb, {}, {}, { gasLimit: 600 });
  assert.equal(memRes.ok, false);
  assert.equal(memRes.error.type, 'MEMORY_EXHAUSTED');

  // 1.8 Complex valid syntax: nested single-line if/for + arrow expr + computed property
  const complexValid = compileGenome(`
    function perceive(s) {
      const arr = [1, 2, 3].map(x => x * 2);
      const obj = { a: arr[0] };
      let sum = 0;
      if (arr.length > 0) for (let i = 0; i < arr.length; i++) sum += arr[i];
      if (sum > 0) obj[arr[1] > 2 ? 'ok' : 'no'] = sum;
      return obj;
    }
    function decide(p) {
      if (p.ok > 5) return { type: 'rest' };
      else if (p.ok > 0) return { type: 'move', angle: 0.5, speed: 0.5 };
      return { type: 'rest' };
    }
  `);
  const complexRes = executeGenomeStep(complexValid, {}, {});
  assert.equal(complexRes.ok, true);
  assert.equal(complexRes.action.type, 'rest');
  assert.ok(complexRes.gasUsed > 0);
  assert.ok(Object.keys(complexRes.branchHits).length >= 2);

  console.log('   ✓ 全部 8 项沙箱安全与复杂插桩测试通过');
}

function testAutonomousEvolution() {
  console.log('2) 测试 600 Ticks 无干预生态演化与 AST 自主编程...');
  const world = new WorldEngine(null, { disableDiskPersistence: true });

  const start = performance.now();
  for (let i = 0; i < 600; i++) {
    world.stepTick();
  }
  const totalMs = performance.now() - start;
  const avgTickMs = totalMs / 600;

  const frame = world.getWorldFrame();
  const phylogeny = world.getPhylogenyData();

  console.log(`   - 600 Ticks 总耗时: ${totalMs.toFixed(1)}ms (均值 ${avgTickMs.toFixed(2)}ms/tick)`);
  console.log(`   - 存活种群: ${frame.stats.population}, 现存物种数: ${frame.stats.speciesCount}`);
  console.log(`   - 累计代码 Commit: ${frame.stats.totalCommits}, 演化档案节点: ${phylogeny.nodes.length}, 演化边: ${phylogeny.edges.length}`);
  console.log(`   - 现存物种分布:`, phylogeny.speciesDistribution.map((s) => `${s.name}(${s.count})`).join(', '));

  assert.ok(avgTickMs < 25, `单刻耗时超标: ${avgTickMs.toFixed(2)}ms`);
  assert.ok(frame.stats.population >= 5, `种群异常枯竭: ${frame.stats.population}`);
  assert.ok(frame.stats.totalCommits > 25, `自我修改 Commit 过少: ${frame.stats.totalCommits}`);
  assert.ok(phylogeny.nodes.length >= 20, `演化谱系节点不足: ${phylogeny.nodes.length}`);

  // Verify at least one organism evolved beyond Gen-0 and has a real non-empty diff commit
  let foundRealDiff = false;
  let foundNewSpecies = false;
  let maxGen = 0;

  for (const node of phylogeny.nodes) {
    if (node.generation > maxGen) maxGen = node.generation;
    if (node.speciesSignature !== 'GEN0-PRIMITIVE') foundNewSpecies = true;
    const detail = world.getOrganismDetail(node.id);
    if (detail?.codeCommits?.some((c) => c.diffPatch && c.diffPatch.includes('@@'))) {
      foundRealDiff = true;
    }
  }

  assert.ok(maxGen >= 1, `未产生后代繁殖 (maxGen=${maxGen})`);
  assert.ok(foundNewSpecies, '600 刻内未演化出超越 Gen-0 的新物种签名');
  assert.ok(foundRealDiff, '未发现真实的代码 Unified Diff 提交');

  // Test mentor-guided evolution on a living organism
  const firstAlive = world.organisms.find((o) => o.alive);
  assert.ok(firstAlive, '没有存活个体可供导师互动测试');
  const interactRes = world.interactWithOrganism(firstAlive.id, {
    action: 'evolve',
    mentorHint: '学会识别共鸣晶簇并发出声波协作信号'
  });
  assert.equal(interactRes.ok, true, `导师引导进化失败: ${interactRes.error}`);
  assert.ok(interactRes.commit.diffPatch.includes('@@'), '导师引导后未产生有效 Diff');

  console.log(`   ✓ 600 Ticks 演化实测通过 (最高世代 Gen-${maxGen}, 新物种已涌现, 导师引导编程有效)`);
}

testSandboxSecurity();
testAutonomousEvolution();
console.log('\n[PASS] CodeLife 后端引擎与安全沙箱全部核心验证通过！');
