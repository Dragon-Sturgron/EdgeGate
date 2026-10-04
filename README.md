# EdgeGate

EdgeGate 是一个面向 Cloudflare Workers 的一体化项目骨架：

- 使用 `cmliu/edgetunnel` 作为 EdgeTunnel 上游；
- 使用 `lsh8848/cm-Workers-CheckSocks5` 作为 SSTP 实际连通性与出口检测上游；
- 内置 VPN Gate 获取、TCP/SSTP 候选筛选、滚动检测、KV 健康节点池；
- 内置 Cron，每 30 分钟自动检测一批；
- 内置 `/admin-gate/` VPN Gate 管理页；
- 保留原 EdgeTunnel `/admin` 后台；
- 生成 `/gate/nodes.txt`。

## 第一版的关键设计

为了降低对 `cmliu/edgetunnel` 内部结构的侵入，第一版不直接改写 EdgeTunnel 的内部 KV 配置。

部署后，在 EdgeTunnel `/admin` 中，把：

`https://你的域名/gate/nodes.txt`

填入“自定义优选 IP / URL”相关配置一次。

之后 nodes.txt 由 EdgeGate 自己通过 Cron 更新，不再需要 GitHub Actions、GitHub Pages 或独立 Check Worker。

## 上游固定版本

构建时自动同步：

- cmliu/edgetunnel: `af4f9837e1843e34159018713bc8749ccec3004d`
- lsh8848/cm-Workers-CheckSocks5: `2f31cf9a242444eb22905d888d4d8871b0625b3a`

同步命令：

```bash
npm run sync:upstreams
```

## Cloudflare 部署

1. GitHub 创建仓库 `EdgeGate`，上传全部文件。
2. Cloudflare -> Workers & Pages -> Create -> Import repository -> 选择 `EdgeGate`。
3. Workers Builds 推荐配置：

Build command：

```bash
npm run sync:upstreams
```

Deploy command：

```bash
npx wrangler deploy
```

这样正式部署和 Preview 构建都会先生成 `src/vendor/edgetunnel.js` 与 `src/vendor/checker.js`。  
如果你不使用单独 Build command，也可以把 Deploy command 改成：

```bash
npm run deploy
```

4. 设置环境变量：

```text
ADMIN=你的后台密码
```

5. 确认 KV binding 名称为：

```text
KV
```

如果自动 provision 没有成功，请在 Worker Settings -> Bindings 手工创建/绑定一个 KV Namespace，binding name 必须是 `KV`。

6. 默认 Cron：

```text
*/30 * * * *
```

7. 部署后访问：

- `/admin`：EdgeTunnel 原后台
- `/admin-gate/`：VPN Gate 管理
- `/gate/nodes.txt`：自动节点文本
- `/api/gate/nodes`：节点 JSON

## 推荐首次参数

- 每轮检测：20
- 并发：4
- 最大延迟：3000 ms
- 连续失败移除：2
- 节点保留时间：360 分钟
- 国家：先留空
- 住宅优先：开
- 机房/未知：首次保留

第一次登录 `/admin-gate/` 后点击“立即检测一轮”。

## 注意

“住宅 / 机房”是根据出口 ASN / hosting 标志做的估算，不是严格住宅 IP 证明。

VPN Gate 是公开志愿者节点池，稳定性、隐私和安全性不能等同于自有服务器或可信付费服务。

请遵守所在地法律法规与相关平台服务条款。
