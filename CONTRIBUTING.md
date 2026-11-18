# Contributing to CodeLife

欢迎参与 **CodeLife（源初盆地观测站）** 的共同演化！在提交 Issue 或 Pull Request 前，请花一分钟了解本项目的核心设计原则与工程规范。

---

## 核心设计红线（必读）

1. **禁止用随机骰子或预设台词伪装智能**：数字生命的行为必须源自其自身真实运行的 JavaScript 基因源码（`perceive` + `decide`）。
2. **禁止预先硬编码高级物种脚本**：Gen-0 原初基因（`GenesisGenomes.js`）应保持极简，高级行为（识毒、声波协晶、光合自养、筑巢避险、模因传播等）必须通过真实环境压力与 AST / LLM 自我编程动态涌现。
3. **沙箱安全不可退让**：任何新增语法支持、感知 API 或动作协议都不得削弱 `GenomeSandbox.js` 的隔离边界，所有逃逸试探必须能被静态审计或运行期探针截获。
4. **每次自我修改皆可观察、可验证**：代码迭代必须保留清晰的修改触发原因、可验证假设、Unified Diff 与 55 刻生存指标实证结果。

---

## 本地开发环境

### 环境准备
- Node.js `>= 20`（推荐 `22.x`）与 npm `>= 10`

### 运行与调试
```bash
# 后端单元测试（沙箱攻防 + 600 Ticks 无干预演化实测）
cd backend
npm install
npm test

# 启动后端监听 :8788
npm run dev

# 新开终端启动前端监听 :5188
cd frontend
npm install
npm run dev
```

---

## 提交 Pull Request 前的检查清单

1. **后端沙箱与演化验证全通过**：
   ```bash
   cd backend && npm test
   ```
   确保 8 项沙箱攻防测试全绿，且 600 Ticks 连续模拟平均单刻耗时保持在可控区间（`< 25ms/tick`）。
2. **前端 TypeScript 类型检查与构建零错误**：
   ```bash
   cd frontend && npm run build
   ```
3. **未提交运行时存档或密钥**：确认 `backend/data/`、`.env`、`node_modules/` 与 `frontend/dist/` 未被暂存。
4. 若新增了沙箱传感器或生物行为动作，请同步更新：
   - `backend/src/evolution/GenesisGenomes.js` 中的 `SANDBOX_API_SPEC`
   - `backend/src/sandbox/PhenotypeExtractor.js` 中的 AST 特征提取规则
   - `backend/test/verify_engine.js` 对应的安全或演化断言
