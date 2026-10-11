import {readFile,writeFile} from 'node:fs/promises';

const path='data/concert-history.json';
const history=JSON.parse(await readFile(path,'utf8'));
const vega=JSON.parse(await readFile('data/vega-concerts.json','utf8'));
const dr=JSON.parse(await readFile('data/dr-concerts.json','utf8'));
const direct=JSON.parse(await readFile('data/direct-venues.json','utf8'));
const now=new Date().toISOString();
const baseline=Object.keys(history).length===0;
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/&amp;/g,'&').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const identity=c=>[normalize(c.venue),c.date,normalize(c.artist)].join('|');
const keyOf=c=>[c.venue,c.date,c.time||'',c.artist.toLowerCase().trim()].join('|');
const existingIdentity=new Set(Object.keys(history).filter(k=>!k.startsWith('__')).map(k=>{const p=k.split('|');return identity({venue:p[0],date:p[1],artist:p.slice(3).join('|')})}));

let concerts=[...vega,...dr,...direct];
const directSources=['Royal Arena','K.B. Hallen','Amager Bio','Pumpehuset'];
const initialized=new Set(directSources.filter(source=>history['__initialized__:'+source]));
const firstDirectSources=new Set(directSources.filter(source=>direct.some(c=>c.source===source)&&!initialized.has(source)));
const vegaBaseline=!history['__initialized__:VEGA'];
try{
 const endpoint=process.env.CONCERTS_API_URL || 'https://koncerter-kobenhavn-git-main-gitte.vercel.app/api/concerts';
 const response=await fetch(endpoint,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('HTTP '+response.status);
 const payload=await response.json();
 if(!Array.isArray(payload.concerts))throw new Error('Unexpected API response');
 concerts.push(...payload.concerts);
 console.log('Concert API:',payload.concerts.length,'events');
}catch(error){
 console.warn('Concert API unavailable, using stored VEGA and DR concerts:',String(error));
}
if(concerts.length===0)throw new Error('No concert data available; preserving history');
let added=0;
for(const c of concerts){
 if(!c.artist||!c.venue||!c.date)continue;
 const key=keyOf(c);
 if(!(key in history)){
  const id=identity(c);
  const alreadyKnown=existingIdentity.has(id);
  history[key]=alreadyKnown?'':((baseline && c.source!=='VEGA')||firstDirectSources.has(c.source)||(vegaBaseline&&c.source==='VEGA')?'':now);
  existingIdentity.add(id);
  added++;
 }
}
for(const source of firstDirectSources)history['__initialized__:'+source]=now;
if(vegaBaseline)history['__initialized__:VEGA']=now;
await writeFile(path,JSON.stringify(history,null,2)+'\n');
console.log('Concert history:',Object.keys(history).length,'added:',added,'baseline:',baseline);
