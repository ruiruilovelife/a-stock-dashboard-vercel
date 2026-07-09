# A股跟踪仪表盘

这是云端版 A股跟踪仪表盘。页面是静态站点，数据来自 `data/dashboard.json`，由 GitHub Actions 在北京时间 09:00、12:30、17:00 自动更新。

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，例如 `a-stock-dashboard`。
2. 上传本目录的所有文件到仓库根目录。
3. 进入仓库 `Settings -> Pages`。
4. `Source` 选择 `GitHub Actions`。
5. 进入 `Actions`，手动运行 `Update A Stock Dashboard` 一次。
6. 完成后 GitHub Pages 会给出固定访问地址。

## 自动更新内容

- 持仓股票收盘价、涨跌幅、成交额、日内高低。
- 上证指数、创业板指、科创50。
- 基于行情的规则化风险判断和操作提示。
- 如果配置了 `OPENAI_API_KEY`，会额外生成模型投研分析。
- 观察池、策略纪律、每日录入模板。

## 配置分析模型

1. 进入 GitHub 仓库 `Settings -> Secrets and variables -> Actions`。
2. 在 `Secrets` 里新增 `OPENAI_API_KEY`。
3. 可选：在 `Variables` 里新增 `OPENAI_DAILY_MODEL` 和 `OPENAI_DEEP_MODEL`。
4. 默认模型：早盘/午间用 `gpt-5.4-mini`，盘后/周末用 `gpt-5.5`。
5. 如果没有配置 `OPENAI_API_KEY`，自动更新不会失败，会降级为规则化投研版本。

## 后续增强

若要做到更接近人工投研的自动新闻分析，需要额外接入稳定新闻源和分析模型 API Key。当前版本先保证云端固定地址和行情自动更新。
