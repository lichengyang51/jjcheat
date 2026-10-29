const fs=require('fs');
function load(n){
  const meta=JSON.parse(fs.readFileSync('testdata/'+n+'.json','utf8'));
  const W=meta.width,H=meta.height,S=meta.stride;
  const bgra=fs.readFileSync('testdata/'+n+'.bgra');
  const rgba=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++){const sr=y*S,dr=y*W*4;for(let x=0;x<W;x++){const s=sr+x*4,d=dr+x*4;rgba[d]=bgra[s+2];rgba[d+1]=bgra[s+1];rgba[d+2]=bgra[s];rgba[d+3]=255;}}
  return {W,H,rgba};
}
const {W,H,rgba}=load('real_jjchess');
// 棋子圆盘是米黄/浅褐，比棋盘底(灰绿)亮且暖
function disk(x,y){
  const i=(y*W+x)*4; const R=rgba[i],G=rgba[i+1],B=rgba[i+2];
  const L=0.299*R+0.587*G+0.114*B;
  return (R-B>45 && L>150 && R>170);
}
// 横轴：只在顶行/底行附近统计
function colPeaks(y0,y1,label){
  const p=new Float64Array(W);
  for(let y=y0;y<=y1;y++)for(let x=0;x<W;x++) if(disk(x,y)) p[x]++;
  let mx=0; for(let x=0;x<W;x++) if(p[x]>mx) mx=p[x];
  const th=mx*0.25, out=[];
  for(let x=2;x<W-2;x++){
    if(p[x]<th) continue;
    if(p[x]<p[x-1]||p[x]<p[x+1]) continue;
    let s=0,sw=0; for(let d=-6;d<=6;d++){const j=x+d; if(j<0||j>=W)continue; s+=j*p[j]; sw+=p[j];}
    out.push(sw>0?s/sw:x);
  }
  const m=[]; for(const v of out){ if(m.length&&v-m[m.length-1]<20) m[m.length-1]=(m[m.length-1]+v)/2; else m.push(v); }
  console.log(label+' 峰: '+m.map(v=>v.toFixed(1)).join(', ') + '  (max='+mx.toFixed(0)+')');
  return m;
}
function rowPeaks(x0,x1,label){
  const p=new Float64Array(H);
  for(let y=0;y<H;y++)for(let x=x0;x<=x1;x++) if(disk(x,y)) p[y]++;
  let mx=0; for(let y=0;y<H;y++) if(p[y]>mx) mx=p[y];
  const th=mx*0.25, out=[];
  for(let y=2;y<H-2;y++){
    if(p[y]<th) continue;
    if(p[y]<p[y-1]||p[y]<p[y+1]) continue;
    let s=0,sw=0; for(let d=-6;d<=6;d++){const j=y+d; if(j<0||j>=H)continue; s+=j*p[j]; sw+=p[j];}
    out.push(sw>0?s/sw:y);
  }
  const m=[]; for(const v of out){ if(m.length&&v-m[m.length-1]<20) m[m.length-1]=(m[m.length-1]+v)/2; else m.push(v); }
  console.log(label+' 峰: '+m.map(v=>v.toFixed(1)).join(', ') + '  (max='+mx.toFixed(0)+')');
  return m;
}
console.log('=== 横向（顶行 330-390）===');
const tc=colPeaks(330,390,'顶行');
console.log('=== 横向（底行 860-920）===');
const bc=colPeaks(860,920,'底行');
console.log('=== 纵向（左列 10-70）===');
const lr=rowPeaks(10,70,'左列');
console.log('=== 纵向（中列 280-310）===');
const mr=rowPeaks(280,310,'中列');
if(tc.length>=2) console.log('\n顶行 格宽 = '+((tc[tc.length-1]-tc[0])/8).toFixed(2));
if(lr.length>=2) console.log('左列 格高 = '+((lr[lr.length-1]-lr[0])/9).toFixed(2));
