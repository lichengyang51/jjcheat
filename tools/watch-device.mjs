#!/usr/bin/env node
/*
 * watch-device.mjs —— 实时盯着 iPhone 有没有出现在 usbmuxd 里
 *
 * 用途：你在手机上解锁 / 拔插线的时候，我这边能立刻看到设备是否上线。
 * 用法：node tools/watch-device.mjs [秒数]
 */
import net from 'node:net';

const SECONDS = parseInt(process.argv[2] || '180', 10);
const INTERVAL = 1500;

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>MessageType</key><string>ListDevices</string>
  <key>ClientVersionString</key><string>jjcheat-watch</string>
  <key>ProgName</key><string>jjcheat</string>
  <key>kLibUSBMuxVersion</key><integer>3</integer>
</dict>
</plist>`;

function probe() {
  return new Promise((resolve) => {
    const payload = Buffer.from(PLIST, 'utf8');
    const header = Buffer.alloc(16);
    header.writeUInt32LE(16 + payload.length, 0);
    header.writeUInt32LE(1, 4);
    header.writeUInt32LE(8, 8);
    header.writeUInt32LE(1, 12);

    const sock = net.createConnection({ host: '127.0.0.1', port: 27015 });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch {}
      resolve(v);
    };
    const t = setTimeout(() => finish(null), 3000);
    sock.on('connect', () => sock.write(Buffer.concat([header, payload])));
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 4) {
        const total = buf.readUInt32LE(0);
        if (buf.length >= total) {
          clearTimeout(t);
          const xml = buf.toString('utf8');
          const m = xml.match(/<key>SerialNumber<\/key>\s*<string>([^<]+)<\/string>/);
          const p = xml.match(/<key>ProductID<\/key>\s*<integer>(\d+)<\/integer>/);
          finish(m ? { serial: m[1], productID: p ? p[1] : '?' } : null);
        }
      }
    });
    sock.on('error', () => { clearTimeout(t); finish(null); });
    sock.on('close', () => { clearTimeout(t); finish(null); });
  });
}

const start = Date.now();
const deadline = start + SECONDS * 1000;
let lastState = null;
console.log(`开始监控 iPhone 上线，最长 ${SECONDS} 秒…`);
console.log('（现在去解锁手机、保持屏幕亮着，或拔插一次数据线）\n');

while (Date.now() < deadline) {
  const dev = await probe();
  const state = dev ? `ONLINE|${dev.serial}|${dev.productID}` : 'OFFLINE';

  if (state !== lastState) {
    const t = ((Date.now() - start) / 1000).toFixed(1);
    if (dev) {
      console.log(`[${t}s] ✅ 设备上线！`);
      console.log(`        序列号   ${dev.serial}`);
      console.log(`        ProductID ${dev.productID}  (4776 = iPhone 16 系列)`);
      console.log('\n>>> 现在立刻去 Sideloadly 看设备列表，应该出现了\n');
    } else {
      console.log(`[${t}s] ❌ 设备不在（usbmuxd 空列表）`);
    }
    lastState = state;
  }
  await new Promise(r => setTimeout(r, INTERVAL));
}

console.log('\n监控结束。');
