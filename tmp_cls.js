const fs=require('fs'),path=require('path'),vm=require('vm');
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
const st=st=>{};
console.log('setCorners ok', JSON.stringify(det.map(p=>p.map(v=>Math.round(v)))));
// 直接看单帧分类结果：learnBoard 之后 process 一帧
E.learnBoard(rgba,W,H);
const o1=E.process(rgba,W,H,{timeMs:200});
console.log('frame1 fen:',o1.fen);
console.log('  codesValid='+o1.codesValid+' stable='+o1.stable+' codesSettled='+o1.codesSettled+' mySide='+o1.mySide+' grid=')
console.log('  grid:'+JSON.stringify(o1.grid));
for(let i=1;i<=4;i++){ const o=E.process(rgba,W,H,{timeMs:200}); console.log('  frame'+(i+1)+' fen:'+o.fen+'  stable='+o.stable+' valid='+o.codesValid+' settled='+o.codesSettled); }
