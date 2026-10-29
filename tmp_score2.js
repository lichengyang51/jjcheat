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
const {W,H,rgba}=load('user_dots');
const det=REC.autoDetectBoard(rgba,W,H);
const rec=new REC.BoardRecognizer({corners:det});
const stats=rec.sampleAll(rgba,W,H,true);
console.log('refined='+rec.lastRefined);
for(const sq of [7*9+0, 8*9+3, 9*9+0, 9*9+1, 6*9+6]){
  const s=stats[sq];
  let vc=0; for(let i=0;i<256;i++) if(s.patchValid[i]) vc++;
  const m=rec.matchCell(s);
  const scores=[];
  for(const key in rec.templates){ let best=-9; for(const t of rec.templates[key]){ const wgt=rec.patchWeights; let sum=0; for(let i=0;i<256;i++) sum+=wgt[i]*(s.patchValid[i]?1:0);
      let dw=0,dr=0; const vw=rec.normalizePatchW(s.patchW,wgt), vr=rec.normalizePatchW(s.patchR,wgt);
      for(let i=0;i<256;i++){ if(!s.patchValid[i])continue; dw+=wgt[i]*vw[i]*t.w[i]; dr+=wgt[i]*vr[i]*t.r[i]; }
      const sc=dw+dr*1.8; if(sc>best)best=sc; }
    scores.push([NAME[+key]||key,best]); }
  scores.sort((a,b)=>b[1]-a[1]);
  console.log('r'+((sq/9)|0)+'c'+(sq%9)+' valid='+vc+' warmR='+(s.warmR||0).toFixed(2)+' inkCore='+(s.inkCoreR||0).toFixed(2)+' 选中='+(NAME[m.key]||m.key)+'@'+m.score.toFixed(2));
  console.log('   top4: '+scores.slice(0,4).map(x=>x[0]+'='+x[1].toFixed(3)).join('  '));
}
