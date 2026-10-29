#!/usr/bin/env node
/*
 * probe-usbmuxd.mjs —— 直接对 127.0.0.1:27015 发 usbmuxd ListDevices 请求
 *
 * 这是 iTunes / Sideloadly / libimobiledevice 判断「有没有 iPhone 连着」的
 * 唯一底层依据。返回空数组 = Apple 的服务压根没看到设备；
 * 返回了序列号 = 服务看得到设备，问题只在配对（信任）环节。
 */
import net from 'node:net';

const HOST = '127.0.0.1';
const PORT = 27015;

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>MessageType</key><string>ListDevices</string>
  <key>ClientVersionString</key><string>jjcheat-probe</string>
  <key>ProgName</key><string>jjcheat</string>
  <key>kLibUSBMuxVersion</key><integer>3</integer>
</dict>
</plist>`;

function buildPacket(tag) {
  const payload = Buffer.from(PLIST, 'utf8');
  const header = Buffer.alloc(16);
  header.writeUInt32LE(16 + payload.length, 0); // 总长度
  header.writeUInt32LE(1, 4);                   // 版本
  header.writeUInt32LE(8, 8);                   // 类型 8 = PLIST
  header.writeUInt32LE(tag, 12);                // 标签
  return Buffer.concat([header, payload]);
}

function listDevices() {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: HOST, port: PORT });
    let buf = Buffer.alloc(0);
    let done = false;

    const finish = (why) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch {}
      resolve({ why, raw: buf.toString('utf8') });
    };

    const timer = setTimeout(() => finish('TIMEOUT'), 6000);

    sock.on('connect', () => {
      sock.write(buildPacket(1));
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      // 收到完整包就结束
      if (buf.length >= 4) {
        const total = buf.readUInt32LE(0);
        if (buf.length >= total) {
          clearTimeout(timer);
          finish('OK');
        }
      }
    });
    sock.on('error', (e) => {
      clearTimeout(timer);
      finish('ERROR: ' + e.code);
    });
    sock.on('close', () => {
      clearTimeout(timer);
      finish('CLOSED');
    });
  });
}

function extractDevices(xml) {
  const devs = [];
  const idx = xml.indexOf('<key>DeviceList</key>');
  if (idx < 0) return devs;
  const body = xml.slice(idx);
  const re = /<key>DeviceID<\/key>\s*<integer>(\d+)<\/integer>/g;
  const sre = /<key>SerialNumber<\/key>\s*<string>([^<]+)<\/string>/g;
  const pre = /<key>ProductID<\/key>\s*<integer>(\d+)<\/integer>/g;
  const cre = /<key>ConnectionType<\/key>\s*<string>([^<]+)<\/string>/g;
  const ids = [...body.matchAll(re)].map(m => m[1]);
  const serials = [...body.matchAll(sre)].map(m => m[1]);
  const pids = [...body.matchAll(pre)].map(m => m[1]);
  const conns = [...body.matchAll(cre)].map(m => m[1]);
  for (let i = 0; i < ids.length; i++) {
    devs.push({
      deviceID: ids[i],
      serial: serials[i] || '(无)',
      productID: pids[i] || '(无)',
      connection: conns[i] || '(无)'
    });
  }
  return devs;
}

const r = await listDevices();
console.log('=== usbmuxd 响应 ===');
console.log('状态:', r.why);
console.log('原始 XML:');
console.log(r.raw ? r.raw : '(空响应)');
console.log('');

const devs = extractDevices(r.raw || '');
if (devs.length === 0) {
  console.log('!!! 结论: Apple 服务没有看到任何 iPhone');
  console.log('    → 设备没插好 / 数据线只有电源 / 手机锁屏禁用了 USB 配件');
} else {
  console.log('=== 看到的设备 ===');
  for (const d of devs) {
    console.log(`  DeviceID=${d.deviceID}  Serial=${d.serial}  ProductID=${d.productID}  Connection=${d.connection}`);
  }
  console.log('');
  console.log('结论: Apple 服务看得到设备，通信链路正常。');
  console.log('      剩下的是配对（lockdown）环节 —— 手机上必须点「信任」。');
}
