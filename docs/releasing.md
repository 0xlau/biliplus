# 自动发布 Chrome 扩展

发布流程由 `.github/workflows/release.yml` 管理：

1. `main` 有新提交时，release-please 根据 Conventional Commits 创建或更新 Release PR。
2. 合并 Release PR 后，release-please 更新 `manifest.json` 和 `version.txt`、生成 `CHANGELOG.md`、创建 `vX.Y.Z` 标签和 GitHub Release。
3. 同一次 Actions 运行会打包 `biliplus.zip`、上传 GitHub Release，再通过 Chrome Web Store API V2 上传扩展并提交审核。
4. 审核通过后，Chrome Web Store 按后台现有的可见性设置自动发布。

## 一次性配置

### 1. Chrome Web Store

- 发布扩展的 Google 账号需启用两步验证。
- Publisher ID 已从 Developer Dashboard URL 写入工作流：`d8f6da75-8e0b-4923-87ad-3f762771918c`。
- Google Cloud 专用项目为 `biliplus-release-0xlau`，已启用 `Chrome Web Store API`。
- Service Account 为 `biliplus-cws-publisher@biliplus-release-0xlau.iam.gserviceaccount.com`；它没有 Google Cloud 项目角色。
- 在 Developer Dashboard 的 `Account` 页面添加该 Service Account 邮箱。目前一个 Publisher 只能添加一个 Service Account。

### 2. GitHub 与 Google Cloud 的无密钥认证

仓库 `0xlau/biliplus` 已配置 GitHub OIDC Workload Identity Federation，并通过 provider 的 attribute condition 和 Service Account IAM 绑定双重限制为仅该仓库可模拟。GitHub principal 只拥有该 Service Account 的 `roles/iam.workloadIdentityUser` 权限。

随后在 GitHub 仓库的 `Settings > Secrets and variables > Actions > Variables` 添加：

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/727490775306/locations/global/workloadIdentityPools/github/providers/biliplus` |
| `CHROME_WEB_STORE_SERVICE_ACCOUNT` | `biliplus-cws-publisher@biliplus-release-0xlau.iam.gserviceaccount.com` |

这条链路使用 GitHub 的短期 OIDC 凭证，不需要保存 Service Account JSON key、OAuth client secret 或 refresh token。

### 3. GitHub Actions 权限

`Settings > Actions > General > Workflow permissions` 中的 `Allow GitHub Actions to create and approve pull requests` 已启用。仓库默认 token 权限仍为只读，工作流自身仅在对应 job 声明所需的 `contents`、`issues`、`pull-requests` 和 `id-token` 权限。

## 日常发布

提交信息使用 Conventional Commits：

- `fix:` 生成 patch 版本。
- `feat:` 生成 minor 版本。
- `feat!:`、`fix!:` 或正文中的 `BREAKING CHANGE:` 生成 major 版本。

release-please 会持续更新 Release PR。准备发布时只需合并该 PR，后续打包、GitHub Release、Chrome Web Store 上传和提交审核均自动完成。

## 失败重试

如果 GitHub Release 已创建，但 Chrome Web Store 步骤失败，可从 Actions 手动运行 `Release`，输入已有标签（例如 `v1.1.0`）。工作流会重新从该标签构建，并覆盖 GitHub Release 中的 ZIP。若同一版本已经发布或正在审核，Chrome 发布脚本会直接成功退出，避免重复提交。

发布请求使用 `blockOnWarnings: true`。Chrome Web Store 返回校验警告时，工作流会停止，不会带着警告自动提交；处理后台问题后再手动重试。
