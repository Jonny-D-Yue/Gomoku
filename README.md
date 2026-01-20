# 五子棋 Online（React + WebSocket）

一个可以在 Internet 联网对战的五子棋网站：
- 前端：React（Vite）
- 后端：Node.js WebSocket（`ws`）
- 功能：创建/加入房间、自动分配黑白、实时同步棋盘、胜负判定、观战

## 本地启动

先确保你有 Node.js（建议 18+，你当前环境已满足）。

在项目根目录：

```bash
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`ws://localhost:8080`

打开两个浏览器窗口：
1. A 点击「创建房间」，复制房间码
2. B 输入房间码点击「加入」
3. 双方开始落子（观战者也可以加入）

## 自定义后端地址（用于部署后）

前端支持环境变量 `VITE_WS_URL`：

```bash
VITE_WS_URL=wss://你的域名 npm --prefix client run dev
```

（生产环境请使用 `wss://`）

## 真正的 Internet 联网对战：部署说明（照做即可）

要让别人用你的网站对战，你需要：
- **把后端 WebSocket 部署到公网**（得到一个公网地址，比如 `wss://gomoku-server.onrender.com`）
- **把前端部署成公网静态站点**（比如 `https://gomoku.vercel.app`）
- 在前端平台配置环境变量：`VITE_WS_URL = wss://你的后端域名`

### 重要：ws / wss
- **本地开发**：前端是 `http://`，所以用 `ws://localhost:8080`
- **线上部署**：前端通常是 `https://`，浏览器会强制要求 WebSocket 使用 **`wss://`**，否则会被拦截

### 部署后端（推荐：Render / Railway / Fly 任选其一）

后端在 `server/`，已经提供 `server/Dockerfile`，大多数平台都可以直接用 Docker 部署。

- **启动端口**：平台会提供环境变量 `PORT`，本项目会自动读取
- **健康检查**：打开后端的 `https://你的域名/` 会返回 `Gomoku WebSocket server is running.`

### 部署前端（Vercel / Netlify 任选其一）

构建命令：

```bash
npm --prefix client run build
```

输出目录：
- `client/dist`

在前端平台配置环境变量：
- `VITE_WS_URL` = `wss://你的后端域名`（例如 `wss://gomoku-server.onrender.com`）

### 上线后的使用方式
1. 任意用户打开你的前端网址
2. A 点击「创建房间」→ 复制房间码
3. B 输入房间码点击「加入」
4. 双方就能在 Internet 上实时对战

