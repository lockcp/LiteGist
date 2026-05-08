# LiteGist

![Language](https://img.shields.io/badge/Language-Node.js-007aff?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange.svg?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0.html)

LiteGist 是一个极其轻量、专注体验的个人自建文本分享服务（Pastebin）。它采用了全屏编辑器的设计理念，支持 Markdown 渲染、代码高亮、多文件 Gist 管理、订阅转换及 PWA，旨在为您提供类似于“私有化 Gist”的极速分享体验。

[English Documentation](./README.md)

---

## ✨ 核心特性

- **🚀 极速分享**：打开即是全屏编辑器，写完即发。
- **🗂️ 多文件 Gist**：支持在单个分享中管理多个文件，内置基于 Git 的版本历史记录。
- **🔌 订阅转换集成**：原生支持 Clash、Sing-box 等订阅格式转换。可作为 GitHub Gist API 代理，完美对接 **Sub-Store**。
- **🔒 隐私安全**：支持为分享设置访问密码、过期时间及自定义 Slug。
- **📱 PWA 支持**：可作为独立 App 安装至手机或电脑，沉浸式使用体验。
- **🌓 自动主题**：完美适配深色/浅色模式，并支持视图过渡动画（View Transitions）。
- **⚙️ 管理面板**：直接在 UI 中管理所有分享、Gists 以及服务器设置（用户名、密码、API Key）。
- **☁️ WebDAV 备份**：支持自动或手动将数据备份至云存储。
- **⚡ 高性能**：基于原生 `node:sqlite` 构建，支持 Gzip 压缩，首屏加载极快。

---

## 🚀 快速开始

### 方式一：使用 Docker (推荐)

这是最简单、最干净的安装方式。

1. **方式 A：使用 Docker Compose (推荐)**
   ```bash
   docker-compose up -d
   ```

2. **方式 B：使用 Docker CLI**
   ```bash
   docker run -d \
     --name litegist \
     -p 3382:3382 \
     -v $(pwd)/data:/app/data \
     -e ADMIN_USERNAME=admin \
     -e ADMIN_PASSWORD=您的密码 \
     lockcp/litegist
   ```

3. **访问与日志**
   - 访问地址：`http://localhost:3382`
   - 默认账号：`admin`
   - 默认密码：`admin888`
   
   > **💡 提示**：如果您没有在环境变量中设置 `API_KEY`，系统在启动时会随机生成一个。您可以通过查看容器日志来获取当前的登录凭据和 API Key，或者直接在后台设置界面查看：
   
   ```bash
   # 查看 Docker 容器日志
   docker logs litegist
   ```

### 方式二：手动安装

确保您的 Node.js 版本 >= 22.5.0。

```bash
# 安装依赖
npm install

# 启动服务器
npm start
```

---

## ⚙️ 环境变量配置

您可以通过 `docker-compose.yml` 或环境变量修改以下配置：

| 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `PORT` | 服务监听端口 | `3382` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员登录密码 | `admin888` |
| `API_KEY` | 程序化调用 API 所需的密钥 | (随机生成) |

---

## 🔌 API 与集成

LiteGist 提供了强大的 API 接口，方便与 **Sub-Store** 等工具集成。

- **管理接口**：`GET/POST /api/v1/admin/...`
- **Gist 代理**：兼容 GitHub Gist 路径，支持直接代理。
- **原始文本获取**：`/:slug/raw` 或 `/gists/:id/raw/:filename`。
- **带鉴权的 Raw 路径**：使用 `/token:<TOKEN>/...` 格式，方便程序化获取带密码的分享内容。

详细文档：[API.md](./API.md) | [API_zh.md](./API_zh.md)

---

## 📄 开源协议

本项目基于 **[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)** (AGPL-3.0) 协议开源。

- **网络公开义务**：如果您通过网络（如网页、API）提供本项目或其修改版的访问服务，您必须向所有用户公开您的源代码。
- **开源传承**：任何基于本项目修改或衍生出的代码，如果对外提供服务，也必须使用 AGPL-3.0 协议开源。
- **署名**：必须保留原作者的署名信息。
