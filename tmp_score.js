const fs=require('fs');
const REC=require('./src/vision/recognizer.js');
function load(n){
  const meta=JSON.parse(fs.readFileSync('testdata/'+n+'.json','utf8'));
  const W=meta.width,H=meta.height,S=meta.stride;
  const bgra=fs.readFileSync('testdata/'+n+'.bgra');
  const rgba=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++){const sr=y*S,dr=y*W*4;for(let x=0;x<W;x++){const s=sr+x*4,d=dr+x*4;rgba[d]=bgra[s+2];rgba[d+1]=bgra[s+1];rgba[d+2]=bgra[s];rgba[d+3]=255;}}
  return {W,H,rgba};
}
const NAME={1:'帥',2:'仕',3:'相',4:'馬',5:'車',6:'炮',7:'兵',8:'將',9:'士',10:'象',11:'馬',12:'車',13:'砲',14:'卒'};
const {W,H,rgba}=load('user_prompt');
const det=REC.autoDetectBoard(rgba,W,H);
const rec=new REC.BoardRecognizer({corners:det});
const stats=rec.sampleAll(rgba,W,H,true);
const tpl=rec.templates;
for(const sq of [9*9+3, 9*9+4, 6*9+4, 3*9+2, 0*9+3]){
  const s=stats[sq];
  const valid=s.patchValid; let vc=0; for(let i=0;i<256;i++) if(valid[i]) vc++;
  const wgt=new Float32Array(256); let sum=0;
  for(let i=0;i<256;i++){ const v=valid[i]?rec.patchWeights[i]:0; wgt[i]=v; sum+=v; }
  for(let i=0;i<256;i++) wgt[i]/=sum;
  const vw=rec.normalizePatchW(s.patchW,wgt);
  const vr=rec.normalizePatchW(s.patchR,wgt);
  const scores=[];
  for(const key in tpl){ let best=-9; for(const t of tpl[key]){ let dw=0,dr=0; for(let i=0;i<256;i++){ dw+=wgt[i]*vw[i]*t.w[i]; dr+=wgt[i]*vr[i]*t.r[i]; } const sc=dw+dr*1.8; if(sc>best)best=sc; }
    scores.push([NAME[+key]||key, best]); }
  scores.sort((a,b)=>b[1]-a[1]);
  console.log('r'+((sq/9)|0)+'c'+(sq%9)+' valid='+vc+' inkCore='+(s.inkCoreR||0).toFixed(3)+' redCore='+(s.redInkCoreR||0).toFixed(3)+' darkCore='+(s.darkInkCoreR||0).toFixed(3));
  console.log('   top5: '+scores.slice(0,5).map(x=>x[0]+'='+x[1].toFixed(3)).join('  '));
}
