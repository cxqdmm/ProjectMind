## 问题与成因

* 多次 mounted 主要由以下因素叠加：

  * 子应用生命周期未按 single-spa 规范实现，`createApp` 在模块顶层或 `bootstrap` 就实例化

  * `unmount` 未彻底清理：未 `app.unmount()`、容器未 `innerHTML=''`、全局监听/定时器未移除

  * 主应用多次注册/多次 `start()` 或路由命中导致重复挂载

  * 开发模式/HMR 与 `vite-plugin-qiankun` 的 `useDevMode` 行为叠加，造成二次挂载

  * 容器复用、`keepAlive` 或未启用 `singular:true` 导致并行/重入

## 快速诊断

* 打点：在子应用导出的 `bootstrap/mount/unmount` 打印唯一标识与次数，确认是否是“多次 mount 未对应 unmount”

* 检查子应用入口：是否只有 `mount(props)` 内才调用 `createApp(App)` 与 `app.mount()`；模块顶层不得创建实例

* 检查清理：`unmount` 是否做 `app.unmount(); app=null; container.innerHTML=''` 并移除所有 `window/document` 监听/定时器

* 主应用侧：是否重复 `registerMicroApps` 或 `start()`；是否导航时未触发 `unmount`

## 子应用代码修正（Vue 3 示例）

* 入口 `main.ts/js` 采用严格的生命周期封装与幂等防护：

```
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
let app = null
let mounted = false
function render(props = {}) {
  const { container } = props
  app = createApp(App)
  app.use(router)
  const mountPoint = container ? container.querySelector('#app') : '#app'
  app.mount(mountPoint)
  mounted = true
}
export async function bootstrap() {}
export async function mount(props) {
  if (mounted) return
  render(props)
}
export async function unmount(props) {
  if (app) {
    app.unmount()
    app = null
    mounted = false
  }
  const { container } = props || {}
  if (container) container.innerHTML = ''
  // 清理全局副作用：事件、定时器、订阅
}
if (!window.__POWERED_BY_QIANKUN__) render()
```

* 组件级副作用：在根组件使用 `onBeforeUnmount` 统一移除 `window.addEventListener`、`setInterval`、`onGlobalStateChange` 等

## 主应用侧修正

* 只在初始化时调用一次 `registerMicroApps` 与 `start()`；避免在路由钩子中重复注册或多次 start

* 路由切换时确保触发 `unmount`：按 `activeRule` 精准匹配，避免多个规则同时匹配同一子应用

* 配置建议：`prefetch: false`（调试时更直观），`singular: true`（避免并行实例）

* 沙箱与样式隔离：`sandbox: { experimentalStyleIsolation: true }` 或 `strictStyleIsolation`，避免样式残留引发重渲染错觉

## vite-plugin-qiankun 注意点

* 子应用 `vite.config` 正确配置插件与 `dynamicPublicPath`，并确保入口仅导出生命周期，不做顶层实例化

* 开发模式：使用 `useDevMode: true` 时，确认 HMR 不会额外触发 `mount`；可在 `mount` 增加幂等 guard（如上）

## 验证与回归

* 编写计数探针：统计 `bootstrap/mount/unmount` 次数与顺序，确保一次打开对应一次 mount + 一次关闭对应一次 unmount

* 路由切换压测：在主应用中多次进入/离开子应用路由，确认计数不累加

* 资源与副作用检查：确认事件监听与定时器在 `unmount` 后为 0，DOM 容器为空

## 交付与落地

* 整理子应用入口模板为标准化脚手架（含幂等与清理）

* 主应用 qiankun 初始化模板与配置示例（单次注册、单次启动、精确 `activeRule`）

* 提供诊断脚本与探针，用于定位重复挂载来源

— 确认后我将：

1. 为你的子应用入口改造为标准生命周期与幂等模板；
2. 修正主应用注册与启动逻辑；
3. 加入探针与 E2E 验证，确保 mounted 不再累加。

