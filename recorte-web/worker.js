'use strict';
importScripts('assets/ort.wasm.min.js');
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('assets/', self.location.href).href;
function surface(w,h){const c=new OffscreenCanvas(w,h);return [c,c.getContext('2d',{willReadFrequently:true})];}
async function recortar(bytes) {
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw new Error('Actualiza Chrome o Android System WebView para usar el recorte.');
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>12*1024*1024)throw new Error('La foto debe pesar menos de 12 MB.');
  const bitmap=await createImageBitmap(new Blob([bytes]));
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('Usa una foto de hasta 40 megapíxeles.');}
  const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const [canvas,ctx]=surface(w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const pixels=ctx.getImageData(0,0,w,h);const rgba=pixels.data;
  let transparent=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]<16)transparent++;
  if(transparent<w*h*.03){
    const [small,sc]=surface(320,320);sc.fillStyle='#fff';sc.fillRect(0,0,320,320);sc.drawImage(canvas,0,0,320,320);
    const rgb=sc.getImageData(0,0,320,320).data,area=320*320;
    let max=1;for(let i=0;i<rgb.length;i+=4)max=Math.max(max,rgb[i],rgb[i+1],rgb[i+2]);
    const mean=[.485,.456,.406],std=[.229,.224,.225],data=new Float32Array(area*3);
    for(let c=0;c<3;c++)for(let i=0;i<area;i++)data[c*area+i]=(rgb[i*4+c]/max-mean[c])/std[c];
    const session=await ort.InferenceSession.create(new URL('assets/u2netp.onnx',self.location.href).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    let prediction;
    try{const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',data,[1,3,320,320])},[session.outputNames[0]]);prediction=out[session.outputNames[0]].data;}finally{await session.release();}
    let lo=Infinity,hi=-Infinity;for(const v of prediction){lo=Math.min(lo,v);hi=Math.max(hi,v);}
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi-lo<.00001)throw new Error('No se pudo distinguir el producto. Prueba otra fotografía.');
    const mask=sc.createImageData(320,320);
    for(let i=0;i<area;i++){const t=Math.max(0,Math.min(1,((prediction[i]-lo)/(hi-lo)-.04)/.92));mask.data[i*4]=mask.data[i*4+1]=mask.data[i*4+2]=255;mask.data[i*4+3]=Math.round(t*t*(3-2*t)*255);}
    sc.putImageData(mask,0,0);
    const [large,lc]=surface(w,h);lc.drawImage(small,0,0,w,h);const alpha=lc.getImageData(0,0,w,h).data;
    for(let i=3;i<rgba.length;i+=4)rgba[i]=Math.round(rgba[i]*alpha[i]/255);
  }
  let left=w,right=-1,top=h,bottom=-1,count=0,light=0,n=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(rgba[i+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}if(rgba[i+3]>220){light+=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];n++;}}
  if(count<w*h*.005)throw new Error('No se pudo distinguir el producto. Prueba una foto más cercana.');
  ctx.putImageData(pixels,0,0);
  const bright=n>0&&light/n>132,colors=bright?['#215b7c','#0e243a']:['#f5fbff','#b5dbf0'];
  const cw=right-left+1,ch=bottom-top+1,s=Math.min(660/cw,660/ch),dw=cw*s,dh=ch*s;
  const [out,oc]=surface(800,800);const gradient=oc.createLinearGradient(0,0,800,800);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);oc.fillStyle=gradient;oc.fillRect(0,0,800,800);
  oc.shadowColor='rgba(0,0,0,.22)';oc.shadowBlur=12;oc.shadowOffsetY=16;oc.drawImage(canvas,left,top,cw,ch,(800-dw)/2,(800-dh)/2,dw,dh);
  for(const size of [800,640,480]){
    const [final,fc]=surface(size,size);fc.drawImage(out,0,0,size,size);
    for(const quality of [.82,.66,.48]){const blob=await final.convertToBlob({type:'image/webp',quality});if(blob.type!=='image/webp')throw new Error('Actualiza el navegador para guardar imágenes WebP.');if(blob.size>49480)continue;const binary=new Uint8Array(await blob.arrayBuffer());let str='';for(const b of binary)str+=String.fromCharCode(b);return {photo:'data:image/webp;base64,'+btoa(str),background:bright?'oscuro':'claro'};}
  }
  throw new Error('No se pudo reducir la imagen. Prueba otra foto.');
}
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,result:await recortar(data.bytes)});}catch(err){self.postMessage({id:data.id,error:err.message||'No se pudo recortar la foto. Inténtalo de nuevo.'});}};
