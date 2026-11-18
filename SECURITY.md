# Security Policy & Genome Sandbox Isolation Architecture

在 **CodeLife** 中，数字生命会自主修改自身 JavaScript 源代码，外部大模型或用户在「基因手术室」提交的源码也会在宿主 Node.js 进程内实时高频执行。**确保自我修改的代码无法逃逸沙箱、修改宿主机程序或耗尽系统资源，是本项目不可妥协的安全红线。**

---

## 四层纵深零信任基因沙箱防线 (`backend/src/sandbox/GenomeSandbox.js`)

### 1. 静态 AST 白名单与安全审计 (`auditGenomeAST`)
- 使用 `acorn`（`ecmaVersion: 2022, sourceType: 'script'`）解析所有基因源码。
- **体积与复杂度硬上限**：源码最大长度 `24,000` 字符，AST 节点总数上限 `1,800` 个。
- **禁用危险语法节点**：显式禁止 `ImportDeclaration`、`ImportExpression`、`Export*`、`WithStatement`、`DebuggerStatement`、`AwaitExpression`、`YieldExpression`、`MetaProperty`、`ClassDeclaration`、`ClassExpression`、`ThisExpression`、`Super`、`LabeledStatement` 及 `async` / `generator` 函数。
- **封禁危险标识符与原型键**：遍历 `Identifier`、非计算 `MemberExpression.property`、`Property.key` 以及解构计算属性，拦截 `process`、`global`、`globalThis`、`Buffer`、`require`、`module`、`exports`、`eval`、`Function`、`Proxy`、`Reflect`、`WebAssembly`、`setTimeout`、`setInterval`、`fetch`、`console`、`Atomics`、`SharedArrayBuffer`、`constructor`、`__proto__`、`prototype`、`__defineGetter__` 等。

### 2. 无重叠点插桩（Point Insertion Instrumentation）
所有通过静态审计的基因源码都会在一次确定性左向右字节偏移拼接中注入三类探针：
- **动态属性访问保护 (`__safeKey`)**：将一切 `obj[expr]` 与计算对象键 `{ [expr]: val }` 包裹为 `__safeKey(expr)`，在运行期阻断 `"con" + "structor"`、`__proto__`、`prototype` 等字符串拼接逃逸攻击（触发 `SECURITY_VIOLATION`）。
- **算力计步与死循环熔断 (`__gas`)**：在每个函数体（含表达式箭头函数）和全部循环体（`for` / `while` / `do-while` / `for-in` / `for-of`）入口注入 `__gas(1)`，单刻执行上限 `600` 步，死循环或无限递归在触及调用栈溢出前即触发 `GasExhaustedError`。
- **执行热力探针 (`__branch`)**：在每个 `IfStatement` 的 `if` 与 `else` 分支入口注入 `__branch("L<line>_T" | "L<line>_F")`，用于真实遥测驱动的死分支裁剪与前端热力图展示。

### 3. V8 隔离执行上下文与资源约束 (`executeGenomeStep`)
- 使用 `vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })` 创建无原型的独立隔离上下文，并在 V8 引擎层面彻底禁用动态代码生成（`eval` / `new Function`）与 WebAssembly。
- 传入的 `sensors` 与 `memory` 均为深拷贝隔离副本，注入只读冻结的 `Math` 子集与安全 `utils`。
- **抢占式超时与记忆上限**：单步运行硬超时 `10 ms`；每次步进后校验 `JSON.stringify(memory)` 体积，超过 `4096 bytes` 立即抛出 `MemoryLimitError` 并回滚工作记忆。

### 4. 外部大模型凭据隔离 (`LLMCodeArchitect.js`)
- 大模型 API Key 仅驻留于服务端内存或本地环境变量，不写入公开源码库，向前端 `/api/llm/config` 返回时自动脱敏为 `sk-x****xxxx` 格式。
- 大模型生成的全部基因源码必须无条件通过上述第 1–3 层沙箱编译审核后方可进入世界运行，不通过则计入 `sandboxRejectedTotal` 并丢弃。

---

## 安全漏洞披露

如发现任何沙箱逃逸向量（如利用新型 JS 语法绕过静态审计与 `__safeKey` 拦截）、原型污染或拒绝服务漏洞，请勿在公开 Issue 中直接披露可利用 Payload，请通过 GitHub Security Advisory 联系维护者。我们会在核实后尽快补充防线与回归测试用例（`backend/test/verify_engine.js`）。
