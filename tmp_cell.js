const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('dist/engine.js','utf8');
const sb={console,Date,Math,JSON,Uint8Array,Int8Array,Uint8ClampedArray,Int32Array,Uint16Array,Uint32Array,Float32Array,Float64Array,Array,Object,String,Number,Boolean,Error,isFinite,isNaN};
sb.globalThis=sb;vm.createContext(sb);vm.runInContext(code,sb);
const E=sb.JJEngine;
function load(n){
  const meta=JSON.parse(fs.readFileSync('testdata/'+n+'.json','utf8'));
  const W=meta.width,H=meta.height,S=meta.stride;
  const bgra=fs.readFileSync('testdata/'+n+'.bgra');
  const rgba=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++){const sr=y*S,dr=y*W*4;for(let x=0;x<W;x++){const s=sr+x*4,d=dr+x*4;rgba[d]=bgra[s+2];rgba[d+1]=bgra[s+1];rgba[d+2]=bgra[s];rgba[d+3]=255;}}
  return {W,H,rgba};
}
const {W,H,rgba}=load('user_prompt');
const det=E.autoDetectBoard(rgba,W,H);
E.reset();E.setCorners(det);
const d=E.debugSample(rgba,W,H);
console.log('idx  sq   inkR  warmR redInk darkInk redR skip');
const watch=[4*9+4, 6*9+4, 9*9+3, 9*9+4, 3*9+2, 7*9+7];
for(const i of watch){ const a=d[i]; console.log(String(i).padStart(3)+'  r'+((i/9)|0)+'c'+(i%9)+'  '+a.slice(1).join('  ')); }
