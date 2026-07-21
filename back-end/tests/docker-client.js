/**
 * Docker Exam Client — runs inside a Docker container.
 *
 * Realistic simulation of a physical exam client machine:
 *   1. Discover server (GET /devices/discover)
 *   2. Detect real container network info (IP, MAC, hostname)
 *   3. Generate stable hardware hash (consistent across restarts)
 *   4. Self-register device (POST /devices/self-register)
 *   5. Start heartbeat loop (POST /devices/heartbeat every N seconds)
 *      - Status transitions: idle → ready → in_exam → idle
 *   6. Launch headless Chrome via Puppeteer
 *   7. Navigate to admin panel, login, take screenshots
 *   8. Navigate to exam page, attempt exam flow
 *   9. Capture screenshots at each step for verification
 *
 * Environment variables:
 *   SERVER_URL         - Backend API URL (default: http://cbe-server:3000)
 *   ADMIN_URL          - Admin panel URL (default: http://cbe-admin)
 *   CLIENT_ID          - Device ID (default: auto-generated from hostname)
 *   CLIENT_NAME        - Device name (default: auto from hostname)
 *   HEARTBEAT_INTERVAL - Seconds between heartbeats (default: 15)
 *   CLIENT_IP          - Override IP (default: auto-detected from network)
 *   ADMIN_EMAIL        - Admin login email (default: admin@cbe.local)
 *   ADMIN_PASSWORD     - Admin login password (default: Admin@123)
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { hostname as getHostname, networkInterfaces } from "os";
import puppeteer from "puppeteer";

const SERVER_URL = process.env.SERVER_URL || "http://cbe-server:3000";
const ADMIN_URL = process.env.ADMIN_URL || "http://cbe-admin";
const HEARTBEAT_INTERVAL =
  parseInt(process.env.HEARTBEAT_INTERVAL || "15", 10) * 1000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@cbe.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const SCREENSHOT_DIR = "/app/screenshots";

let _tag = `[${process.env.CLIENT_ID || "CLIENT"}]`;
const log = (...args) => console.log(_tag, ...args);
const logErr = (...args) => console.error(_tag, ...args);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ============ Detect Real Network Info ============
function detectNetworkInfo() {
  const hostname = getHostname();
  const interfaces = networkInterfaces();

  let ipAddress = null;
  let macAddress = null;

  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        ipAddress = iface.address;
        macAddress = iface.mac;
        log(
          `📡 Network interface: ${name} — IP=${ipAddress}, MAC=${macAddress}`,
        );
        break;
      }
    }
    if (ipAddress) break;
  }

  if (!ipAddress) {
    ipAddress = process.env.CLIENT_IP || "127.0.0.1";
    log(`⚠️  No external interface found, using fallback IP: ${ipAddress}`);
  }
  if (!macAddress) {
    const hash = createHash("sha256").update(hostname).digest();
    macAddress = [hash[0] & 0xfe, hash[1], hash[2], hash[3], hash[4], hash[5]]
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
    log(
      `⚠️  No MAC detected, generated stable MAC from hostname: ${macAddress}`,
    );
  }

  return { hostname, ipAddress, macAddress };
}

// ============ Generate Stable Hardware Hash ============
function generateHardwareHash(networkInfo) {
  const stableData = [
    networkInfo.hostname,
    networkInfo.macAddress,
    "x86_64",
    "Linux",
    "Alpine",
  ].join("|");

  return createHash("sha256").update(stableData).digest("hex");
}

// ============ Generate Device ID ============
function generateDeviceId(networkInfo) {
  if (process.env.CLIENT_ID) return process.env.CLIENT_ID;
  const shortHash = createHash("sha256")
    .update(networkInfo.hostname)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();
  return `PC-${shortHash}`;
}

function generateDeviceName(networkInfo) {
  if (process.env.CLIENT_NAME) return process.env.CLIENT_NAME;
  return networkInfo.hostname;
}

// ============ Detect Client Version ============
function getClientVersion() {
  try {
    const pkg = JSON.parse(readFileSync("/app/package.json", "utf8"));
    return `cbe-client-${pkg.version || "1.0.0"}`;
  } catch {
    return "cbe-client-1.0.0";
  }
}

// ============ Step 1: Discover Server ============
async function discoverServer() {
  log("🔍 Step 1: Discovering server on network...");
  try {
    const res = await fetchJson(`${SERVER_URL}/api/v1/devices/discover`);
    if (res.status === 200) {
      log(`✅ Discovered server: ${res.data.serverName} v${res.data.version}`);
      log(`   API URL: ${res.data.apiUrl}`);
      log(`   Endpoints: ${JSON.stringify(res.data.endpoints)}`);
      return res.data;
    } else {
      logErr(`❌ Discover failed: HTTP ${res.status}`);
      return null;
    }
  } catch (err) {
    logErr(`❌ Cannot reach server at ${SERVER_URL}: ${err.message}`);
    return null;
  }
}

// ============ Step 2: Self-Register ============
async function selfRegister(
  networkInfo,
  deviceId,
  deviceName,
  hardwareHash,
  clientVersion,
) {
  log("📝 Step 2: Self-registering device with server...");
  log(`   Device ID: ${deviceId}`);
  log(`   Name: ${deviceName}`);
  log(`   MAC: ${networkInfo.macAddress}`);
  log(`   IP: ${networkInfo.ipAddress}`);
  log(`   Hardware Hash: ${hardwareHash.substring(0, 16)}...`);
  log(`   Client Version: ${clientVersion}`);

  try {
    const res = await fetchJson(`${SERVER_URL}/api/v1/devices/self-register`, {
      method: "POST",
      body: {
        deviceId,
        deviceName,
        macAddress: networkInfo.macAddress,
        hardwareHash,
        ipAddress: networkInfo.ipAddress,
        clientVersion,
      },
    });

    if (res.status === 200 || res.status === 201) {
      log(
        `✅ Registered successfully: id=${res.data.id}, status=${res.data.status}`,
      );
      return { ...res.data, hardwareHash };
    } else {
      logErr(`❌ Registration failed: HTTP ${res.status}`, res.data);
      return null;
    }
  } catch (err) {
    logErr(`❌ Registration error: ${err.message}`);
    return null;
  }
}

// ============ Step 3: Heartbeat Loop with Status Transitions ============
let heartbeatTimer = null;
let heartbeatCount = 0;
let currentStatus = "idle";

const STATUS_TIMELINE = [
  {
    afterBeats: 0,
    status: "idle",
    label: "Device idle, waiting for exam assignment",
  },
  { afterBeats: 4, status: "ready", label: "Exam assigned, device ready" },
  { afterBeats: 8, status: "in_exam", label: "Exam in progress" },
  { afterBeats: 20, status: "idle", label: "Exam completed, back to idle" },
  { afterBeats: 30, status: "ready", label: "Next exam assigned, ready again" },
  { afterBeats: 34, status: "in_exam", label: "Second exam in progress" },
  { afterBeats: 46, status: "idle", label: "All exams done, idle" },
];

function getStatusForBeat(beat) {
  let current = "idle";
  for (const transition of STATUS_TIMELINE) {
    if (beat >= transition.afterBeats) {
      current = transition.status;
    }
  }
  return current;
}

function startHeartbeat(
  deviceId,
  networkInfo,
  hardwareHash,
  deviceName,
  clientVersion,
) {
  log(
    `💓 Step 3: Starting heartbeat loop (every ${HEARTBEAT_INTERVAL / 1000}s)...`,
  );

  sendHeartbeat(
    deviceId,
    networkInfo,
    hardwareHash,
    deviceName,
    clientVersion,
    "idle",
  );

  heartbeatTimer = setInterval(() => {
    const newStatus = getStatusForBeat(heartbeatCount + 1);
    if (newStatus !== currentStatus) {
      const transition = STATUS_TIMELINE.find(
        (t) => t.status === newStatus && t.afterBeats <= heartbeatCount + 1,
      );
      log(
        `🔄 Status transition: ${currentStatus} → ${newStatus} (${transition?.label || ""})`,
      );
      currentStatus = newStatus;
    }
    sendHeartbeat(
      deviceId,
      networkInfo,
      hardwareHash,
      deviceName,
      clientVersion,
      currentStatus,
    );
  }, HEARTBEAT_INTERVAL);
}

async function sendHeartbeat(
  deviceId,
  networkInfo,
  hardwareHash,
  deviceName,
  clientVersion,
  status,
) {
  try {
    const res = await fetchJson(`${SERVER_URL}/api/v1/devices/heartbeat`, {
      method: "POST",
      body: {
        deviceId,
        status,
        ipAddress: networkInfo.ipAddress,
        // Include full device info so server can auto-re-register if device was deleted
        macAddress: networkInfo.macAddress,
        hardwareHash,
        deviceName,
        clientVersion,
      },
    });

    if (res.status === 200) {
      heartbeatCount++;
      log(`💓 Heartbeat #${heartbeatCount} OK (status=${status})`);
    } else if (res.status === 201) {
      heartbeatCount++;
      log(
        `💓 Heartbeat #${heartbeatCount} — device auto-re-registered! (was deleted, now back)`,
      );
    } else {
      logErr(`❌ Heartbeat failed: HTTP ${res.status}`, res.data);
    }
  } catch (err) {
    logErr(`❌ Heartbeat error: ${err.message}`);
  }
}

// ============ Step 4: Browser Automation ============
async function runBrowserTests(deviceId) {
  log("🌐 Step 4: Launching headless Chrome browser...");

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        `--window-size=1280,800`,
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // 4a: Navigate to admin panel (without login — should redirect)
    log("📸 Navigating to admin panel (unauthenticated)...");
    try {
      await page.goto(`${ADMIN_URL}/devices`, {
        waitUntil: "networkidle2",
        timeout: 15000,
      });
      await sleep(2000);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${deviceId}-01-unauth-redirect.png`,
      });
      log("📸 Screenshot: unauthenticated access saved");
    } catch (err) {
      log(`⚠️  Admin panel not accessible: ${err.message}`);
    }

    // 4b: Login as admin
    log("🔐 Logging in as admin...");
    try {
      await page.goto(`${ADMIN_URL}/login`, {
        waitUntil: "networkidle2",
        timeout: 15000,
      });

      const emailInput = await page.$(
        'input[type="email"], input[name="email"]',
      );
      const passwordInput = await page.$(
        'input[type="password"], input[name="password"]',
      );

      if (emailInput && passwordInput) {
        await emailInput.type(ADMIN_EMAIL);
        await passwordInput.type(ADMIN_PASSWORD);

        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) {
          await loginBtn.click();
          await sleep(3000);
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${deviceId}-02-after-login.png`,
          });
          log("📸 Screenshot: after login saved");

          // 4c: Navigate to devices page and verify our device
          log("📋 Navigating to Devices page...");
          await page.goto(`${ADMIN_URL}/devices`, {
            waitUntil: "networkidle2",
            timeout: 15000,
          });
          await sleep(2000);
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${deviceId}-03-devices-page.png`,
          });
          log("📸 Screenshot: devices page saved");

          const pageText = await page.evaluate(() => document.body.innerText);
          if (pageText.includes(deviceId)) {
            log(
              `✅ CONFIRMED: Device ${deviceId} is visible in admin device table!`,
            );
          } else {
            log(
              `⚠️  Device ${deviceId} NOT found in device list (may need refresh)`,
            );
          }

          // 4d: Navigate to dashboard
          log("📊 Navigating to Dashboard...");
          await page.goto(`${ADMIN_URL}/`, {
            waitUntil: "networkidle2",
            timeout: 15000,
          });
          await sleep(2000);
          await page.screenshot({
            path: `${SCREENSHOT_DIR}/${deviceId}-04-dashboard.png`,
          });
          log("📸 Screenshot: dashboard saved");

          // 4e: Check Live Monitor page
          log("� Navigating to Live Monitor...");
          try {
            await page.goto(`${ADMIN_URL}/live-monitor`, {
              waitUntil: "networkidle2",
              timeout: 10000,
            });
            await sleep(2000);
            await page.screenshot({
              path: `${SCREENSHOT_DIR}/${deviceId}-05-live-monitor.png`,
            });
            log("📸 Screenshot: live monitor saved");
          } catch (err) {
            log(`⚠️  Live monitor not accessible: ${err.message}`);
          }
        }
      } else {
        log("⚠️  Login form not found on admin panel");
      }
    } catch (err) {
      log(`⚠️  Admin login failed: ${err.message}`);
    }

    log("✅ Browser tests complete");
  } catch (err) {
    logErr(`❌ Browser test error: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ============ Main ============
async function main() {
  const networkInfo = detectNetworkInfo();
  const deviceId = generateDeviceId(networkInfo);
  const deviceName = generateDeviceName(networkInfo);
  const hardwareHash = generateHardwareHash(networkInfo);
  const clientVersion = getClientVersion();

  _tag = `[${deviceId}]`;

  console.log("\n" + "=".repeat(60));
  console.log(`${_tag} 🚀 Docker Exam Client Starting`);
  console.log(`${_tag}    Hostname: ${networkInfo.hostname}`);
  console.log(`${_tag}    Server:   ${SERVER_URL}`);
  console.log(`${_tag}    Admin:    ${ADMIN_URL}`);
  console.log(`${_tag}    Device:   ${deviceId} (${deviceName})`);
  console.log(`${_tag}    IP:       ${networkInfo.ipAddress}`);
  console.log(`${_tag}    MAC:      ${networkInfo.macAddress}`);
  console.log(`${_tag}    HW Hash:  ${hardwareHash.substring(0, 32)}...`);
  console.log(`${_tag}    Version:  ${clientVersion}`);
  console.log("=".repeat(60) + "\n");

  const discovery = await discoverServer();
  if (!discovery) {
    logErr("💥 Cannot continue without server. Retrying in 10s...");
    await sleep(10000);
    process.exit(1);
  }

  const registration = await selfRegister(
    networkInfo,
    deviceId,
    deviceName,
    hardwareHash,
    clientVersion,
  );
  if (!registration) {
    logErr("💥 Registration failed. Retrying in 10s...");
    await sleep(10000);
    process.exit(1);
  }

  startHeartbeat(
    deviceId,
    networkInfo,
    hardwareHash,
    deviceName,
    clientVersion,
  );

  await sleep(3000);
  await runBrowserTests(deviceId);

  console.log(`\n${_tag} ✅ Client fully operational.`);
  console.log(`${_tag}    Heartbeats: every ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log(
    `${_tag}    Status transitions: idle → ready → in_exam → idle (simulating real exam cycle)`,
  );
  console.log(`${_tag}    Screenshots saved to: ${SCREENSHOT_DIR}/`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  process.on("SIGINT", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    log(`🛑 Shutting down after ${heartbeatCount} heartbeats`);
    process.exit(0);
  });

  setInterval(() => {
    log(
      `📊 Status: ${heartbeatCount} heartbeats sent, current status=${currentStatus}`,
    );
  }, 60000);
}

main().catch((err) => {
  logErr("💥 Fatal error:", err);
  process.exit(1);
});
