# 🐱 PurrMetrics

> **A beautiful, real-time VPS monitoring dashboard with a dash of feline charm.**

![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square&logo=node.js)
![Docker](https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-purple?style=flat-square)

PurrMetrics gives you a gorgeous live dashboard for your VPS — CPU, memory, disk, uptime, and network bandwidth with historical charts. Built with Chart.js and a pure vanilla frontend, zero frameworks.

---

## ✨ Features

- 🐾 **Live CPU, Memory & Disk** usage with animated progress bars
- 🌐 **Network bandwidth** — live speed + historical views (1H, 1D, 7D, 30D)
- 😺 **System info** — OS, hostname, architecture, CPU model
- 📊 **Persistent bandwidth history** — survives server restarts
- 🐳 **Docker ready** — one command deploy
- 🔒 **Custom domain support** via Nginx Proxy Manager

---

## 📸 Preview

```
┌─────────────────────────────────────────┐
│  🐱 PurrMetrics          ● Live         │
├─────────────────────────────────────────┤
│   Your VPS, purring along 🐾            │
│   Real-time system stats                │
│   🐧 Ubuntu  😺 2d 4h 12m  ● Live      │
├─────────────────────────────────────────┤
│  🌐 Network Bandwidth  LIVE 1H 1D 7D   │
│  ⬇ 1.24 MB/s          ⬆ 320 KB/s      │
├──────────┬──────────┬────────────────── │
│ 🐾 CPU   │ 🧶 RAM   │ 🐟 Disk          │
│  12.4%   │  44.2%   │  61.0%           │
└──────────┴──────────┴──────────────────┘
```

---

## 🗂 Project Structure

```
purrmetrics/
├── public/
│   └── index.html       # Frontend dashboard
├── data/
│   └── bandwidth.json   # Auto-generated, persisted history
├── server.js            # Express backend + systeminformation
├── docker-compose.yml   # Docker deployment
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ **or** Docker + Docker Compose
- A VPS running Linux

---

### Option A — Run with Docker (Recommended)

**Step 1.** Clone or copy the project files to your VPS:

```bash
mkdir purrmetrics && cd purrmetrics
# copy server.js, package.json, docker-compose.yml, public/index.html
```

**Step 2.** Start the container:

```bash
docker compose up -d
```

**Step 3.** Verify it's running:

```bash
docker compose ps
curl http://localhost:3000
```

You should get back the HTML page. Done! 🎉

---

### Option B — Run with Node.js directly

**Step 1.** Install dependencies:

```bash
npm install
```

**Step 2.** Start the server:

```bash
node server.js
```

**Step 3.** Open your browser at `http://localhost:3000`

**NOTE.** Use `http:PUBLIC_VPS_IP:3000` if you are on VPS. You may also need to open port 3000 manually for this to work. (MUST, IF YOU USING ORACLE CLOUD)

---

## 🌐 Setting Up a Custom Domain (Nginx Proxy Manager)

This is the recommended way to expose PurrMetrics publicly with SSL.

> ⚠️ PurrMetrics uses `network_mode: host` in Docker so it can read real VPS network stats. This means it can't join Docker bridge networks — NPM reaches it via the host gateway IP instead.

---

### Step 1 — Allow Docker networks through iptables

Run these on your VPS to allow NPM to reach the host:

```bash
sudo iptables -I INPUT -s 172.21.0.0/16 -j ACCEPT
sudo iptables -I INPUT -s 172.17.0.0/16 -j ACCEPT
```

Make the rules **permanent** so they survive reboots:

```bash
sudo apt install iptables-persistent
sudo netfilter-persistent save
```

---

### Step 2 — Find your NPM network gateway IP

```bash
docker network inspect <your-npm-network-name> | grep Gateway
```

Example output:
```
"Gateway": "172.21.0.1"
```

> Not sure of your NPM network name? Run `docker network ls` to list all networks.

---

### Step 3 — Point your domain DNS

In your DNS provider (Cloudflare, etc.):

- Add an **A record** pointing `dash.yourdomain.com` → your VPS public IP
- If using Cloudflare, **turn off the orange cloud** (set to DNS only) while testing

---

### Step 4 — Add Proxy Host in NPM

Open your Nginx Proxy Manager web UI and create a new Proxy Host:

| Field | Value |
|-------|-------|
| Domain Names | `dash.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname / IP | `172.21.0.1` *(your gateway IP from Step 2)* |
| Forward Port | `3000` |
| Cache Assets | Off |
| Websockets Support | Off |

---

### Step 5 — Enable SSL

In the **SSL tab** of your proxy host:

- Select **Request a new SSL certificate**
- Enable **Force SSL**
- Enable **HTTP/2 Support**
- Agree to Let's Encrypt ToS
- Hit Save

Your dashboard is now live at `https://dash.yourdomain.com` 🎉

---

## 🐳 Docker Compose Reference

```yaml
services:
  purrmetrics:
    image: node:20-alpine
    container_name: purrmetrics
    restart: unless-stopped
    working_dir: /app
    network_mode: "host"
    volumes:
      - .:/app
      - ./data:/app/data
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/os-release:/etc/os-release:ro
      - /etc/hostname:/etc/hostname:ro
    command: sh -c "npm install --omit=dev && node server.js"
    environment:
      - PORT=3000
      - HOST_PROC=/host/proc
```

> `network_mode: host` is required to read real network interface stats from the VPS. Without it, you'd only see Docker internal traffic.

> The `/proc`, `/sys`, and `/etc/os-release` mounts let `systeminformation` read the real host OS details instead of Alpine Linux (the base Docker image).

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system` | GET | CPU, memory, disk, uptime, OS info |
| `/api/network` | GET | Live RX/TX speed + cumulative totals |
| `/api/bandwidth/hour` | GET | Per-minute samples for last 60 minutes |
| `/api/bandwidth/day` | GET | Per-hour samples for last 24 hours |
| `/api/bandwidth/week` | GET | Per-hour samples for last 7 days |
| `/api/bandwidth/month` | GET | Per-day samples for last 30 days |

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on |
| `HOST_PROC` | `/proc` | Path to host `/proc` (set to `/host/proc` in Docker) |

---

## 🛠 Troubleshooting

**Bad Gateway in NPM**
> Run the iptables commands in Step 1 above. This is the most common cause — iptables blocks Docker bridge traffic to the host even when UFW is inactive.

**Dashboard shows Alpine Linux instead of Ubuntu**
> Make sure the volume mounts for `/etc/os-release` and `/proc` are present in your `docker-compose.yml`.

**Network stats show 0**
> Ensure `network_mode: host` is set and `HOST_PROC=/host/proc` is in your environment variables.

**Bandwidth history lost after restart**
> The `./data` volume mount persists `bandwidth.json`. Make sure it's present in your compose file.

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `systeminformation` | Cross-platform system stats |

Frontend uses only CDN-loaded libraries — no build step needed:
- [Chart.js 4.4](https://www.chartjs.org/)
- [Inter & JetBrains Mono](https://fonts.google.com/) (Google Fonts)

---

## 📝 License

MIT — do whatever you want with it 🐾

---

<div align="center">
  Made with ♥ and a lot of 🐱 • PurrMetrics
</div>
