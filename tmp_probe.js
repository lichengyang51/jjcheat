const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=process.cwd();
const code=fs.readFileSync(path.join(ROOT,'dist','engine.js'),'utf8');
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
for(const n of ['real_jjchess','real_442x959','user_prompt','user_dots']){
  const {W,H,rgba}=load(n);
  console.log('===== '+n+' '+W+'x'+H);
  const r=E.autoDetectDebug(rgba,W,H);
  if(!r.corners){ console.log('  检测失败', JSON.stringify(r.debug&&r.debug.pieceFit)); continue; }
  const c=r.corners;
  console.log('  初始 '+(r.debug&&r.debug.initial? r.debug.initial.map(p=>'('+p[0].toFixed(1)+','+p[1].toFixed(1)+')').join(' '):'?'));
  console.log('  最终 '+c.map(p=>'('+p[0].toFixed(1)+','+p[1].toFixed(1)+')').join(' '));
  const cw=(c[1][0]-c[0][0])/8, ch=(c[3][1]-c[0][1])/9;
  console.log('  格宽 '+cw.toFixed(1)+' 格高 '+ch.toFixed(1)+' 比例 '+(cw/ch).toFixed(3)+'  路径 '+r.debug.used);
  const pf=r.debug.pieceFit;
  if(pf) console.log('  棋子拟合 cellW='+pf.cellW.toFixed(1)+' cellH='+pf.cellH.toFixed(1)+' cols='+pf.cols+' rows='+pf.rows+' peaksX='+pf.colPeaks+' peaksY='+pf.rowPeaks);
  else console.log('  棋子拟合 未采用');
  if(pf&&pf.peaksY) console.log('  peaksY: '+pf.peaksY.map(v=>v.toFixed(0)).join(','));
  if(pf&&pf.peaksX) console.log('  peaksX: '+pf.peaksX.map(v=>v.toFixed(0)).join(','));
}
