# LiteGist API 接口文档

基础 URL: `http://<您的服务器IP>:3382`

---

## 🔐 身份验证

所有管理接口均需要身份验证。您可以通过以下方式进行验证：

1. **API Key 请求头**:
   ```
   X-API-Key: <您的API_KEY>
   ```
   或者使用 `Authorization`：
   ```
   Authorization: Bearer <您的API_KEY>
   ```

2. **Session Cookie**: (Web 管理界面自动使用)。

---

## 🌍 公共访问接口

### 1. 获取原始文本 (普通分享)
`GET /:slug/raw`  
返回 `text/plain` 格式的原始文本。

**对于设有密码的分享:**
`GET /token:<access_token>/:slug/raw`

### 2. 获取原始 Gist 文件
`GET /gists/:id/raw/:filename`  
`GET /gists/:id/raw/:version_sha/:filename`  
返回 Gist 中特定文件的原始内容。

**对于设有密码的 Gist:**
`GET /token:<access_token>/gists/:id/raw/:filename`

### 3. 订阅转换 (外部工具)
- `GET /:slug/raw/:format` (普通分享)
- `GET /gists/:id/raw/:filename/:format` (Gist 文件)
- `GET /gists/:id/raw/:version_sha/:filename/:format` (Gist 特定版本)

**支持的格式**:
- **Clash 系列**: `clash`, `clashmeta` (或 `meta`, `mihomo`), `stash`。
- **Sing-box**: `sing-box` (或 `singbox`)。
- **Surge**: `surge`, `surgemac`。
- **Quantumult X**: `qx` (或 `quanx`)。
- **其他客户端**: `loon`, `v2ray` (或 `v2`), `shadowrocket`, `surfboard`, `egern`。
- **通用格式**: `uri` (通用连接), `json` (原始 JSON 节点), `b64` (Base64 编码的原始文本)。

### 4. Gist 差异比对 (Diff)
`GET /gists/:id/diff/:version_sha`  
返回当前版本与指定版本之间的视觉差异。

---

## 🛠️ 管理接口 (需管理员权限)

### 1. Gist 管理
- `GET /gists`: 获取所有 Gist 列表。
- `POST /gists`: 创建新的 Gist。
  - 请求体: `{"description": "...", "files": {"f1.txt": {"content": "..."}}, "is_public": 1, "password": "..."}`
- `GET /gists/:id`: 获取特定 Gist 的详细元数据。
- `PATCH /gists/:id`: 更新现有 Gist。
- `DELETE /gists/:id`: 删除 Gist。

### 2. 普通分享管理
- `POST /api/v1/admin/text/generate`: 创建分享。
- `GET /api/v1/admin/shares`: 获取全部分享列表。
- `GET /api/v1/admin/shares/:slug`: 获取特定分享的详细信息。
- `PUT /api/v1/admin/shares/:slug`: 更新分享属性。
- `DELETE /api/v1/admin/shares`: 批量删除分享 (请求体: `{"slugs": ["..."]}`)。

### 3. 服务器设置
- `GET /api/v1/admin/settings`: 获取当前用户名和 API Key。
- `POST /api/v1/admin/settings`: 更新管理员设置。
  - 请求体: `{"username": "用户名", "password": "密码", "apiKey": "API密钥"}`

### 4. WebDAV 与数据管理
- `GET /api/v1/admin/webdav/settings`: 获取 WebDAV 配置。
- `POST /api/v1/admin/webdav/settings`: 更新 WebDAV 配置。
- `POST /api/v1/admin/webdav/backup`: 触发手动备份至 WebDAV。
- `POST /api/v1/admin/webdav/restore`: 从 WebDAV 恢复数据。
- `POST /api/v1/admin/export`: 将所有数据导出为 JSON 文件。
- `POST /api/v1/admin/import`: 从 JSON 文件导入数据。

---

## 🔌 Sub-Store 集成 (Gist 代理)

LiteGist 可以作为 GitHub Gist API 的透明代理。您可以直接在 Sub-Store 中将 LiteGist 实例配置为 GitHub 源。

**代理基础路径:**
`http://<您的服务器IP>:3382/https://api.github.com`

**Sub-Store 配置说明:**
1. 在 Sub-Store 中添加 "Gist" 类型的源时，将上述 URL 填入代理或 Base URL。
2. LiteGist 会拦截发往 `/gists` 的请求并返回本地 Gist 数据，实现无缝对接。
