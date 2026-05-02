const express = require('express');
const os = require('os');
const si = require('systeminformation');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --------- Bandwidth History Storage ----------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bandwidth.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let history = {
  minute: [],  // last 60 min, per-minute samples (for Hourly view)
  hour:   [],  // last 30 days worth, per-hour samples
  day:    [],  // last 365 days, per-day samples
};
let cumulative = { rx: 0, tx: 0, lastRx: null, lastTx: null };

// Load persisted data
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    history = raw.history || history;
    cumulative = raw.cumulative || cumulative;
  }
} catch (e) { console.error('Failed to load history:', e.message); }

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ history, cumulative }));
  } catch (e) { console.error('Persist error:', e.message); }
}

// Track network activity
let lastSample = { rx: 0, tx: 0, t: Date.now() };
let minuteAccum = { rx: 0, tx: 0, samples: 0, start: Date.now() };

async function sampleNetwork() {
  try {
    const nets = await si.networkStats();
    // Sum primary interfaces
    const totalRx = nets.reduce((a, n) => a + (n.rx_bytes || 0), 0);
    const totalTx = nets.reduce((a, n) => a + (n.tx_bytes || 0), 0);

    const now = Date.now();

    if (cumulative.lastRx !== null) {
      const dRx = Math.max(0, totalRx - cumulative.lastRx);
      const dTx = Math.max(0, totalTx - cumulative.lastTx);
      cumulative.rx += dRx;
      cumulative.tx += dTx;
      minuteAccum.rx += dRx;
      minuteAccum.tx += dTx;
      minuteAccum.samples++;
    }
    cumulative.lastRx = totalRx;
    cumulative.lastTx = totalTx;

    lastSample = {
      rx: nets.reduce((a, n) => a + (n.rx_sec || 0), 0),
      tx: nets.reduce((a, n) => a + (n.tx_sec || 0), 0),
      t: now,
    };
  } catch (e) { console.error('Sample error:', e.message); }
}

// Aggregate per-minute samples
function rollupMinute() {
  const ts = Date.now();
  history.minute.push({
    t: ts,
    rx: minuteAccum.rx,
    tx: minuteAccum.tx,
  });
  // keep last 24h of minutes (safety)
  const cutoff = ts - 24 * 60 * 60 * 1000;
  history.minute = history.minute.filter((m) => m.t >= cutoff);

  minuteAccum = { rx: 0, tx: 0, samples: 0, start: ts };
  persist();
}

// Aggregate per-hour
function rollupHour() {
  const ts = Date.now();
  const hourCutoff = ts - 60 * 60 * 1000;
  const hourSamples = history.minute.filter((m) => m.t >= hourCutoff);
  const rx = hourSamples.reduce((a, s) => a + s.rx, 0);
  const tx = hourSamples.reduce((a, s) => a + s.tx, 0);
  history.hour.push({ t: ts, rx, tx });
  // keep 30 days
  const cut = ts - 30 * 24 * 60 * 60 * 1000;
  history.hour = history.hour.filter((h) => h.t >= cut);
  persist();
}

// Aggregate per-day
function rollupDay() {
  const ts = Date.now();
  const dayCutoff = ts - 24 * 60 * 60 * 1000;
  const daySamples = history.hour.filter((h) => h.t >= dayCutoff);
  const rx = daySamples.reduce((a, s) => a + s.rx, 0);
  const tx = daySamples.reduce((a, s) => a + s.tx, 0);
  history.day.push({ t: ts, rx, tx });
  // keep 365 days
  const cut = ts - 365 * 24 * 60 * 60 * 1000;
  history.day = history.day.filter((d) => d.t >= cut);
  persist();
}

// Start samplers
sampleNetwork();
setInterval(sampleNetwork, 2000);
setInterval(rollupMinute, 60 * 1000);          // every minute
setInterval(rollupHour, 60 * 60 * 1000);       // every hour
setInterval(rollupDay, 24 * 60 * 60 * 1000);   // every day

// ------------- API Routes -------------
app.get('/api/system', async (req, res) => {
  try {
    const [cpu, mem, osInfo, load, disk, time] = await Promise.all([
      si.cpu(), si.mem(), si.osInfo(), si.currentLoad(), si.fsSize(), si.time(),
    ]);
    res.json({
      cpu: {
        brand: cpu.brand, cores: cpu.cores, speed: cpu.speed,
        load: load.currentLoad.toFixed(1),
      },
      memory: {
        total: mem.total, used: mem.active, free: mem.available,
        percent: ((mem.active / mem.total) * 100).toFixed(1),
      },
      os: {
        platform: osInfo.platform, distro: osInfo.distro, release: osInfo.release,
        hostname: os.hostname(), arch: osInfo.arch, kernel: osInfo.kernel,
        logofile: osInfo.logofile,
      },
      disk: disk.map((d) => ({ fs: d.fs, size: d.size, used: d.used, use: d.use })),
      uptime: time.uptime,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network', (req, res) => {
  res.json({
    rx_sec: lastSample.rx,
    tx_sec: lastSample.tx,
    rx_total: cumulative.rx,
    tx_total: cumulative.tx,
  });
});

// Historical bandwidth by range
app.get('/api/bandwidth/:range', (req, res) => {
  const now = Date.now();
  const range = req.params.range;
  let data = [];

  if (range === 'hour') {
    // last 60 minutes of per-minute samples
    const cut = now - 60 * 60 * 1000;
    data = history.minute.filter((m) => m.t >= cut);
  } else if (range === 'day') {
    // last 24h of per-hour samples
    const cut = now - 24 * 60 * 60 * 1000;
    data = history.hour.filter((h) => h.t >= cut);
  } else if (range === 'week') {
    // last 7 days of per-hour samples (bucketed to 6h for readability? keep hourly)
    const cut = now - 7 * 24 * 60 * 60 * 1000;
    data = history.hour.filter((h) => h.t >= cut);
  } else if (range === 'month') {
    // last 30 days of per-day samples
    const cut = now - 30 * 24 * 60 * 60 * 1000;
    data = history.day.filter((d) => d.t >= cut);
  }
  res.json(data);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐾 PurrMetrics v2 running at http://0.0.0.0:${PORT}`);
});
