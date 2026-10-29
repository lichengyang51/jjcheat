const fs=require('fs');
function load(n){
  const meta=JSON.parse(fs.readFileSync('testdata/'+n+'.json','utf8'));
  const W=meta.width,H=meta.height,S=meta.stride;
  const bgra=fs.readFileSync('testdata/'+n+'.bgra');
  const rgba=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++){const sr=y*S,dr=y*W*4;for(let x=0;x<W;x++){const s=sr+x*4,d=dr+x*4;rgba[d]=bgra[s+2];rgba[d+1]=bgra[s+1];rgba[d+2]=bgra[s];rgba[d+3]=255;}}
  return {W,H,rgba};
}
function measure(name){
  const {W,H,rgba}=load(name);
  const disk=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4; const R=rgba[i],G=rgba[i+1],B=rgba[i+2];
    const L=0.299*R+0.587*G+0.114*B;
    if(R-B>45 && L>150 && R>170) disk[y*W+x]=1;
  }
  const integ=new Int32Array((W+1)*(H+1));
  for(let y=0;y<H;y++){let rs=0;for(let x=0;x<W;x++){rs+=disk[y*W+x];integ[(y+1)*(W+1)+x+1]=integ[y*(W+1)+x+1]+rs;}}
  function dens(x,y,rad){
    const xa=Math.max(0,Math.round(x-rad)),xb=Math.min(W-1,Math.round(x+rad));
    const ya=Math.max(0,Math.round(y-rad)),yb=Math.min(H-1,Math.round(y+rad));
    if(xb<xa||yb<ya)return 0;
    const a=integ[ya*(W+1)+xa],b=integ[ya*(W+1)+xb+1],c=integ[(yb+1)*(W+1)+xa],d=integ[(yb+1)*(W+1)+xb+1];
    return (d-b-c+a)/((xb-xa+1)*(yb-ya+1));
  }
  function score(x0,cw,y0,ch){
    let s=0,hits=0;
    for(let r=0;r<10;r++){const y=y0+r*ch;for(let c=0;c<9;c++){const x=x0+c*cw;
      const d=dens(x,y,Math.min(cw,ch)*0.30); s+=d; if(d>0.35)hits++;}}
    return {s,hits};
  }
  // 估计先验：用磁盘总体加权质心范围粗定
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,n=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(disk[y*W+x]){ if(y>300&&y<1000){n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;} }
  // 全搜索（先验：589x1280 布局）
  const sx=W/589, sy=H/1280;
  const p={x0:58.3*sx, cw:63.51*sx, y0:373.5*sy, ch:61.9*sy};
  let best=null;
  for(let fx=-1.2;fx<=1.2;fx+=0.1) for(let fy=-1.2;fy<=1.2;fy+=0.1)
  for(let sw=-0.10;sw<=0.1001;sw+=0.01) for(let sh=-0.10;sh<=0.1001;sh+=0.01){
    const cw=p.cw*(1+sw), ch=p.ch*(1+sh);
    const x0=p.x0+fx*p.cw, y0=p.y0+fy*p.ch;
    const r=score(x0,cw,y0,ch);
    if(!best||r.hits>best.hits||(r.hits===best.hits&&r.s>best.s)) best={x0,cw,y0,ch,hits:r.hits,s:r.s};
  }
  console.log(name+': x0='+best.x0.toFixed(1)+' cw='+best.cw.toFixed(2)+' y0='+best.y0.toFixed(1)+' ch='+best.ch.toFixed(2)+' hits='+best.hits+' score='+best.s.toFixed(2)+'  diskPx='+n);
  console.log('   归一化 x0/W='+(best.x0/W).toFixed(4)+' cw/W='+(best.cw/W).toFixed(4)+' y0/H='+(best.y0/H).toFixed(4)+' ch/H='+(best.ch/H).toFixed(4));
  return best;
}
['real_jjchess','real_442x959','user_prompt','user_dots'].forEach(measure);
