// 把一帧旋转 180 度，模拟「用户执黑」时 JJ象棋 的画面（整盘转过来）
const fs = require('fs');
const src = process.argv[2], dst = process.argv[3];
const meta = JSON.parse(fs.readFileSync('testdata/' + src + '.json', 'utf8'));
const W = meta.width, H = meta.height, S = meta.stride;
const bgra = fs.readFileSync('testdata/' + src + '.bgra');
const out = Buffer.alloc(S * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = y * S + x * 4;
    const d = (H - 1 - y) * S + (W - 1 - x) * 4;
    out[d] = bgra[s]; out[d + 1] = bgra[s + 1]; out[d + 2] = bgra[s + 2]; out[d + 3] = 255;
  }
}
fs.writeFileSync('testdata/' + dst + '.bgra', out);
fs.writeFileSync('testdata/' + dst + '.json', JSON.stringify({ width: W, height: H, stride: S }));
console.log('已生成 testdata/' + dst + '  ' + W + 'x' + H);
