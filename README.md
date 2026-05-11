# LiteGist

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="admin/icon-192.png">
    <img src="admin/icon-192.png" alt="LiteGist app icon" width="96" height="96">
  </picture>

  <br>
  <br>

  <img src="https://img.shields.io/badge/Language-Node.js-007aff?style=flat-square" alt="Language">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square" alt="Docker">
  <a href="https://www.gnu.org/licenses/agpl-3.0.html">
    <img src="https://img.shields.io/badge/License-AGPL--3.0-orange.svg?style=flat-square" alt="License">
  </a>
</div>


LiteGist is an extremely lightweight, experience-focused personal standalone pastebin service. Designed with a full-screen editor philosophy, it supports Markdown rendering, code highlighting, password protection, Gist-compatible multi-file management, and PWA support. It aims to provide you with a high-performance "Private Gist" sharing experience.

[中文文档 (Chinese)](./README_zh.md)

---

## ✨ Key Features

- **🚀 Instant Sharing**: Open to a full-screen editor—write and share immediately.
- **🗂️ Multi-file Gists**: Manage multiple files within a single share with Git-backed version history.
- **🔌 Sub-Store Integration**: Native support for subscription conversion (Clash, Sing-box, etc.). Acts as a GitHub Gist API proxy.
- **🔒 Privacy & Security**: Set access passwords, expiration dates, and custom slugs for your shares.
- **📱 PWA Support**: Install as a standalone app on your phone or desktop for an immersive experience.
- **🌓 Adaptive Theme**: Perfect support for Dark/Light modes with smooth transitions.
- **⚙️ Admin Dashboard**: Manage all your shares, gists, and server settings (Username, Password, API Key) directly from the UI.
- **☁️ WebDAV Backup**: Automated or manual backups to your preferred cloud storage.
- **⚡ High Performance**: Built with native `node:sqlite` and Gzip compression for blazing-fast page loads.

---

## 🚀 Quick Start

### Method 1: Using Docker (Recommended)

The simplest and cleanest way to install.

1. **Option A: Docker Compose (Recommended)**
   Create a `docker-compose.yml` and run:
   ```bash
   docker-compose up -d
   ```

2. **Option B: Docker CLI**
   ```bash
   docker run -d \
     --name litegist \
     -p 3382:3382 \
     -v $(pwd)/data:/app/data \
     -e ADMIN_USERNAME=admin \
     -e ADMIN_PASSWORD=your_password \
     lockcp/litegist
   ```

3. **Access & Logs**
   - URL: `http://localhost:3382`
   - Default Username: `admin`
   - Default Password: `admin888`
   
   > **💡 Tip**: If you don't set an `API_KEY` in environment variables, a random one will be generated on startup. You can find it in the container logs:
   
   ```bash
   docker logs litegist
   ```

### Method 2: Manual Installation

Ensure you have **Node.js >= 22.5.0** installed.

```bash
# Install dependencies
npm install

# Start the server
npm start
```

---

## ⚙️ Environment Variables

You can customize the following variables in your `docker-compose.yml` or shell:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server listening port | `3382` |
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin login password | `admin888` |
| `API_KEY` | Key for programmatic API access | (Randomly generated) |

---

## 🔌 API & Integration

LiteGist provides a robust API for management and integration with tools like **Sub-Store**.

- **Admin API**: `GET/POST /api/v1/admin/...`
- **Gist Proxy**: Supports GitHub-compatible paths for seamless proxying.
- **Raw Access**: `/:slug/raw` or `/gists/:id/raw/:filename`.
- **Authenticated Raw**: `/token:<TOKEN>/...` for programmatic access to password-protected content.

Detailed documentation: [API.md](./API.md) | [API_zh.md](./API_zh.md)

---

## 📄 License

This project is licensed under the **[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)** (AGPL-3.0).

- **Network Public Requirement**: If you provide access to this project or a modified version over a network, you must make the source code available to all users.
- **Copyleft**: Any derivative works must also be licensed under AGPL-3.0.
- **Attribution**: You must provide credit to the original author.

---

## Related Projects
- [EdgeGist](https://github.com/xream/EdgeGist)

  > Minimal GitHub Gist-compatible API service running on Cloudflare's edge network, backed by D1 and packaged for Cloudflare Pages.
