# 纳斯达克长期投资策略 v4.1 助手

本项目把 v4.1 月频策略落到网页配置、月末信号计算、手机推送和 GitHub Actions 自动运行中。程序只给出建议，不直接下单。

每日观察消息按 `nsdk.dailyChecks` 的北京时间工作日时段发送，展示当前有效月度状态、NDX 最新点位与一年高点、当前回撤，以及纳指/黄金/债券的当前仓位和目标仓位差异。每日消息只作观察，不展示 513100 行情，也不提供买卖建议；正式操作仍以月末通知为准。

## 策略规则

- 信号数据：QQQ 月度前复权收盘价。
- 趋势：月末价格高于 SMA10 为正。
- 动量：12 个月收益率大于 0 为正。
- 强势：趋势与动量都为正，目标为纳指 70% / 黄金 15% / 债券 15%。
- 过渡：趋势与动量一正一负，目标为 55% / 15% / 30%。
- 防守：趋势与动量都为负，目标为 15% / 15% / 70%。
- 高波动保护：6 个月收益率年化波动率超过 35% 时，纳指目标减少 15 个百分点并转入债券，纳指最低 15%。
- 再平衡：状态或高波动保护变化时调仓；状态不变时，仅在任一目标资产偏离超过 3 个百分点时调仓。
- 每月现金流：默认 ¥4,000，优先补目标缺口最大的资产；全部接近目标时按目标比例分配。
- 债券工具：海富通中证短融 ETF（511360）。

## 本地运行

```powershell
npm install
npm test
npm run app:run-once -- month-end
```

检查当前时间是否存在到期的 `dailyChecks` 时段并发送每日观察：

```powershell
npm run app:run-once -- daily
```

强制重新生成并推送当前月份建议：

```powershell
npm run app:run-once -- once
```

本地运行默认读取被 Git 忽略的 `Config/local-secrets.json`，因此可以像旧版一样直接推送，不必每次设置环境变量。模板见 `Config/local-secrets.example.json`。环境变量 `NSDK_SERVERCHAN_SENDKEY` 的优先级更高，可临时覆盖本地文件。

行情 API Key 和 SendKey 不应写入会提交的 `Config/settings.json`。

## GitHub Actions

- `deploy-pages.yml`：部署静态网页到 GitHub Pages。
- `nsdk-cron.yml`：每个工作日美股收盘后检查完整月线；同一个信号月份只推送一次。
- `nsdk-daily.yml`：按当前 `dailyChecks` 对应的北京时间11:00、14:00运行每日观察，并在发送失败时短时重试。
- `save-settings.yml`：接收网页配置并保存到 `Config/settings.json`。

仓库 Settings → Secrets and variables → Actions 中至少配置：

- `NSDK_SERVERCHAN_SENDKEY`
- `FINNHUB_API_KEY`（仅旧版兼容功能需要，v4.1 月末信号不依赖）

GitHub Pages 地址应为 `https://qq1446039171.github.io/nasdk-v4.1/`。

## 主要文件

- `Config/settings.json`：持仓和 v4.1 参数。
- `app/nsdk/src/v41-strategy.js`：纯策略计算。
- `app/nsdk/src/v41-action.js`：月末行情、金额建议和推送。
- `app/nsdk/src/v41-daily.js`：每日行情、当前状态与仓位目标差异推送。
- `app/nsdk/src/v41-daily-schedule.js`：按 `dailyChecks` 判断到期、去重和失败重试。
- `app/nsdk/state.json`：最近一次月末信号及调仓建议。
- `web/index.html`：网页执行面板。

历史 v3 计算代码仍保留用于旧数据兼容，但默认定时任务和首页执行面板都已切换为 v4.1。
