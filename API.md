# LiteGist API Documentation

Base URL: `http://<your-host>:3382`

---

## 🔐 Authentication

All Admin API endpoints require authentication. You can authenticate via:

1. **API Key Header**:
   ```
   X-API-Key: <your-api-key>
   ```
   Or:
   ```
   Authorization: Bearer <your-api-key>
   ```

2. **Session Cookie**: (Used automatically by the web UI).

---

## 🌍 Public Access

### 1. Get Raw Text (Standard Share)
`GET /:slug/raw`  
Returns `text/plain` content.

**For password-protected shares:**
`GET /token:<access_token>/:slug/raw`

### 2. Get Raw Gist File
`GET /gists/:id/raw/:filename`  
`GET /gists/:id/raw/:version_sha/:filename`  
Returns the raw content of a specific file within a Gist.

**For password-protected Gists:**
`GET /token:<access_token>/gists/:id/raw/:filename`

### 3. Subscription Conversion (External Tools)
- `GET /:slug/raw/:format` (Standard Share)
- `GET /gists/:id/raw/:filename/:format` (Gist File)
- `GET /gists/:id/raw/:version_sha/:filename/:format` (Gist Specific Version)

**Supported Formats**:
- **Clash Family**: `clash`, `clashmeta` (or `meta`, `mihomo`), `stash`.
- **Sing-box**: `sing-box` (or `singbox`).
- **Surge**: `surge`, `surgemac`.
- **Quantumult X**: `qx` (or `quanx`).
- **Other Clients**: `loon`, `v2ray` (or `v2`), `shadowrocket`, `surfboard`, `egern`.
- **General**: `uri` (Universal Links), `json` (Raw JSON nodes), `b64` (Base64 encoded raw).

### 4. Gist Diff
`GET /gists/:id/diff/:version_sha`  
Returns a visual diff of changes between the current version and the specified version.

---

## 🛠️ Admin Management (Admin Auth Required)

### 1. Gist Management
- `GET /gists`: List all gists.
- `POST /gists`: Create a new gist.
  - Body: `{"description": "...", "files": {"f1.txt": {"content": "..."}}, "is_public": 1, "password": "..."}`
- `GET /gists/:id`: Get detailed metadata for a gist.
- `PATCH /gists/:id`: Update an existing gist.
- `DELETE /gists/:id`: Delete a gist.

### 2. Standard Share Management
- `POST /api/v1/admin/text/generate`: Create a share.
- `GET /api/v1/admin/shares`: List all shares.
- `GET /api/v1/admin/shares/:slug`: Get details for a specific share.
- `PUT /api/v1/admin/shares/:slug`: Update a share.
- `DELETE /api/v1/admin/shares`: Delete shares (Body: `{"slugs": ["..."]}`).

### 3. Server Settings
- `GET /api/v1/admin/settings`: Retrieve current Username and API Key.
- `POST /api/v1/admin/settings`: Update Admin settings.
  - Body: `{"username": "...", "password": "...", "apiKey": "..."}`

### 4. WebDAV & Data
- `GET /api/v1/admin/webdav/settings`: Get WebDAV config.
- `POST /api/v1/admin/webdav/settings`: Update WebDAV config.
- `POST /api/v1/admin/webdav/backup`: Trigger a manual backup to WebDAV.
- `POST /api/v1/admin/webdav/restore`: Restore from WebDAV.
- `POST /api/v1/admin/export`: Export all shares and gists as a JSON file.
- `POST /api/v1/admin/import`: Import data from an exported JSON file.

---

## 🔌 Sub-Store Integration (Gist Proxy)

LiteGist acts as a transparent proxy for the GitHub Gist API. You can point Sub-Store to your LiteGist instance as if it were GitHub.

**Proxy Base Path**:
`http://<your-host>:3382/https://api.github.com`

**How to use with Sub-Store**:
1. When adding a "Gist" source in Sub-Store, use the above URL as the proxy or Base URL.
2. LiteGist will intercept requests to `/gists` and return local Gist data.
