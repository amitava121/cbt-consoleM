/**
 * Mock Device Clients — simulates 10 physical devices on the network.
 * Each device:
 *   1. Calls GET /devices/discover to find the server
 *   2. Calls POST /devices/self-register to register itself
 *   3. Sends POST /devices/heartbeat every 15s to stay "online"
 *
 * Usage: node tests/mock-device-clients.js [count] [serverUrl]
 * Default: 10 clients, server at http://localhost:3000
 */

const SERVER = process.argv[3] || "http://localhost:3000";
const COUNT = parseInt(process.argv[2] || "10", 10);

const DEVICE_NAMES = [
  "Lab1-PC01", "Lab1-PC02", "Lab1-PC03", "Lab1-PC04", "Lab1-PC05",
  "Lab1-PC06", "Lab1-PC07", "Lab1-PC08", "Lab1-PC09", "Lab1-PC10",
  "Lab2-PC01", "Lab2-PC02", "Lab2-PC03", "Lab2-PC04", "Lab2-PC05",
];

const STATUSES = ["idle", "ready", "in_exam", "idle", "ready"];

function randomMac(i) {
  const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `${hex(i)}:${hex(i + 1)}:${hex(i + 2)}:${hex(i + 3)}:${hex(i + 4)}:${hex(i + 5)}`;
}

function randomIP(i) {
  return `192.168.1.${100 + i}`;
}

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

async function runClient(index) {
  const deviceId = `MOCK-PC-${String(index + 1).padStart(3, "0")}`;
  const deviceName = DEVICE_NAMES[index] || `Lab-PC${index + 1}`;
  const macAddress = randomMac(index + 1);
  const hardwareHash = `hw_hash_${deviceId}_${Date.now()}`;
  const ipAddress = randomIP(index + 1);

  const tag = `[${deviceId}]`;
  console.log(`${tag} Starting mock device client...`);

  // Step 1: Discover server
  try {
    const discover = await fetchJson(`${SERVER}/api/v1/devices/discover`);
    if (discover.status === 200) {
      console.log(`${tag} ✅ Discovered server: ${discover.data.serverName} v${discover.data.version}`);
    } else {
      console.log(`${tag} ⚠️  Discover returned ${discover.status}`);
    }
  } catch (err) {
    console.error(`${tag} ❌ Cannot reach server at ${SERVER}: ${err.message}`);
    return;
  }

  // Step 2: Self-register
  try {
    const reg = await fetchJson(`${SERVER}/api/v1/devices/self-register`, {
      method: "POST",
      body: {
        deviceId,
        deviceName,
        macAddress,
        hardwareHash,
        ipAddress,
        clientVersion: "mock-1.0.0",
      },
    });

    if (reg.status === 201) {
      console.log(`${tag} ✅ Self-registered: id=${reg.data.id}, status=${reg.data.status}`);
    } else if (reg.status === 200) {
      console.log(`${tag} ✅ Updated registration: status=${reg.data.status}`);
    } else {
      console.error(`${tag} ❌ Registration failed: ${reg.status}`, reg.data);
      return;
    }
  } catch (err) {
    console.error(`${tag} ❌ Registration error: ${err.message}`);
    return;
  }

  // Step 3: Heartbeat loop
  let beatCount = 0;
  const heartbeatInterval = setInterval(async () => {
    try {
      const status = STATUSES[index % STATUSES.length];
      const hb = await fetchJson(`${SERVER}/api/v1/devices/heartbeat`, {
        method: "POST",
        body: {
          deviceId,
          status,
          ipAddress,
        },
      });

      if (hb.status === 200) {
        beatCount++;
        console.log(`${tag} 💓 Heartbeat #${beatCount} OK (status=${status})`);
      } else {
        console.error(`${tag} ❌ Heartbeat failed: ${hb.status}`, hb.data);
      }
    } catch (err) {
      console.error(`${tag} ❌ Heartbeat error: ${err.message}`);
    }
  }, 15000); // 15s interval

  // Send one immediate heartbeat so device shows online right away
  setTimeout(async () => {
    try {
      const hb = await fetchJson(`${SERVER}/api/v1/devices/heartbeat`, {
        method: "POST",
        body: { deviceId, status: "idle", ipAddress },
      });
      if (hb.status === 200) {
        console.log(`${tag} 💓 Initial heartbeat OK`);
      }
    } catch (err) {
      console.error(`${tag} ❌ Initial heartbeat error: ${err.message}`);
    }
  }, 500 * (index + 1)); // stagger initial heartbeats

  // Handle shutdown
  process.on("SIGINT", () => {
    clearInterval(heartbeatInterval);
    console.log(`${tag} 🛑 Shutting down after ${beatCount} heartbeats`);
  });

  return heartbeatInterval;
}

async function main() {
  console.log(`\n🚀 Starting ${COUNT} mock device clients against ${SERVER}\n`);

  const intervals = [];
  for (let i = 0; i < COUNT; i++) {
    intervals.push(await runClient(i));
    await sleep(200); // stagger registration
  }

  console.log(`\n✅ All ${COUNT} clients registered and sending heartbeats every 15s`);
  console.log(`📡 Check the admin Device page — ${COUNT} devices should show as "Online"`);
  console.log(`\nPress Ctrl+C to stop all clients\n`);

  process.on("SIGINT", () => {
    console.log("\n🛑 Stopping all mock clients...");
    intervals.forEach((iv) => iv && clearInterval(iv));
    process.exit(0);
  });
}

main().catch(console.error);
