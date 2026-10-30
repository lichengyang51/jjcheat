#!/usr/bin/env node
/*
 * crop-png.mjs —— 把 .bgra 测试帧按格子裁出来拼成一张放大图，用于肉眼核对
 *
 * 用法:
 *   node tools/crop-png.mjs <fixture> <out.png> <zoom> r1c1 r2c4 ...
 *   不给格子就导出整盘
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

export function writePng(file, rgb, W, H) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[o++] = rgb[i]; raw[o++] = rgb[i + 1]; raw[o++] = rgb[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

export function loadFrame(name) {
  const base = path.join(ROOT, 'testdata', name);
  const meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  const W = meta.width, H = meta.height, S = meta.stride;
  const bgra = fs.readFileSync(base + '.bgra');
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sr = y * S, dr = y * W * 4;
    for (let x = 0; x < W; x++) {
      const s = sr + x * 4, d = dr + x * 4;
      rgba[d] = bgra[s + 2]; rgba[d + 1] = bgra[s + 1]; rgba[d + 2] = bgra[s]; rgba[d + 3] = 255;
    }
  }
  return { W, H, rgba };
}

function loadEngine() {
  const code = fs.readFileSync(path.join(ROOT, 'dist', 'engine.js'), 'utf8');
  const sb = {
    console, Date, Math, JSON, Uint8Array, Int8Array, Uint8ClampedArray,
    Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array,
    Array, Object, String, Number, Boolean, Error, isFinite, isNaN
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return sb.JJEngine;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const fixture = process.argv[2];
  const outFile = process.argv[3] || 'crop.png';
  const zoom = Number(process.argv[4] || 3);
  const sqs = process.argv.slice(5).map(s => {
    const m = /^r(\d)c(\d)$/.exec(s);
    return m ? Number(m[1]) * 9 + Number(m[2]) : -1;
  }).filter(v => v >= 0);

  const { W, H, rgba } = loadFrame(fixture);
  const E = loadEngine();
  E.reset();
  const c = E.autoDetectBoard(rgba, W, H);
  E.setCorners(c);
  const cw = (c[1][0] - c[0][0]) / 8, chh = (c[3][1] - c[0][1]) / 9;

  const cellsToDraw = sqs.length ? sqs : Array.from({ length: 90 }, (_, i) => i);
  const half = Math.ceil(Math.max(cw, chh) * 0.62);
  const cwPx = half * 2, chPx = half * 2;
  const cols = Math.min(9, cellsToDraw.length);
  const rows = Math.ceil(cellsToDraw.length / cols);
  const OUT_W = cols * cwPx * zoom, OUT_H = rows * chPx * zoom;
  const out = new Uint8Array(OUT_W * OUT_H * 3);

  for (let k = 0; k < cellsToDraw.length; k++) {
    const sq = cellsToDraw[k];
    const cx = Math.round(c[0][0] + (sq % 9) * cw);
    const cy = Math.round(c[0][1] + ((sq / 9) | 0) * chh);
    const gx = (k % cols) * cwPx * zoom;
    const gy = ((k / cols) | 0) * chPx * zoom;
    for (let y = 0; y < chPx * zoom; y++) {
      for (let x = 0; x < cwPx * zoom; x++) {
        const sx = cx - half + Math.floor(x / zoom);
        const sy = cy - half + Math.floor(y / zoom);
        let r = 20, g = 20, b = 20;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
          const i = (sy * W + sx) * 4;
          r = rgba[i]; g = rgba[i + 1]; b = rgba[i + 2];
        }
        // 画十字准星：标出交叉点（也就是采样中心）
        if (Math.floor(x / zoom) === half && Math.abs(y - chPx * zoom / 2) < zoom * 3) { r = 0; g = 255; b = 0; }
        if (Math.floor(y / zoom) === half && Math.abs(x - cwPx * zoom / 2) < zoom * 3) { r = 0; g = 255; b = 0; }
        const o = ((gy + y) * OUT_W + gx + x) * 3;
        out[o] = r; out[o + 1] = g; out[o + 2] = b;
      }
    }
  }
  writePng(path.resolve(ROOT, outFile), out, OUT_W, OUT_H);
  console.log(`已写入 ${outFile}  ${OUT_W}x${OUT_H}  格宽 ${cw.toFixed(2)} 格高 ${chh.toFixed(2)}  共 ${cellsToDraw.length} 格`);
}
