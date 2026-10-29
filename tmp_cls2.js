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
for(const n of ['real_jjchess','user_prompt','user_dots']){
  const {W,H,rgba}=load(n);
  const det=E.autoDetectBoard(rgba,W,H);
  E.reset();E.setCorners(det);
  const c=E.classifyBoard(rgba,W,H);
  console.log('=== '+n+'  occupied='+c.occupied+' red='+c.redN+' blk='+c.blkN+' valid='+c.valid+' usable='+c.usable);
  console.log('  FEN '+c.fen);
}
