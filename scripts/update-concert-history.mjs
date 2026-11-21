import {readFile,writeFile} from 'node:fs/promises';

const path='data/concert-history.json';
const history=JSON.parse(await readFile(path,'utf8'));
const vega=JSON.parse(await readFile('data/vega-concerts.json','utf8'));
const dr=JSON.parse(await readFile('data/dr-concerts.json','utf8'));
const direct=JSON.parse(await readFile('data/direct-venues.json','utf8'));
const now=new Date().toISOString();
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/&amp;/g,'&').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const identity=c=>[normalize(c.venue),c.date,normalize(c.artist)].join('|');
const keyOf=c=>[c.venue,c.date,c.time||'',normalize(c.artist)].join('|');
const known=new Map();
for(const [key,value] of Object.entries(history)){
 if(key.startsWith('__'))continue;
 const p=key.split('|');if(p.length<4)continue;
 const id=identity({venue:p[0],date:p[1],artist:p.slice(3).join('|')});
 const previous=known.get(id);
 // Preserve the earliest valid discovery timestamp, but never fabricate one.
 if(!known.has(id)||(!previous&&value)||(previous&&value&&Date.parse(value)<Date.parse(previous)))known.set(id,value);
}
const sources=[['VEGA',vega],['DR Koncerthuset',dr],['Royal Arena',direct.filter(c=>c.source==='Royal Arena')],['K.B. Hallen',direct.filter(c=>c.source==='K.B. Hallen')],['Amager Bio',direct.filter(c=>c.source==='Amager Bio')],['Pumpehuset',direct.filter(c=>c.source==='Pumpehuset')],['Bremen Teater',direct.filter(c=>c.source==='Bremen Teater')]];
// A source's first import is a baseline, not a batch of newly announced shows.
const baselineSources=new Set(sources.filter(([name,events])=>events.length&&!history['__initialized__:'+name]).map(([name])=>name));
let concerts=[...vega,...dr,...direct];
try{
 const endpoint=process.env.CONCERTS_API_URL||'https://koncerter-kobenhavn-git-main-gitte.vercel.app/api/concerts';
 const response=await fetch(endpoint,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const payload=await response.json();
 if(!Array.isArray(payload.concerts))throw Error('Unexpected API response');
 concerts.push(...payload.concerts);
 console.log('Concert API:',payload.concerts.length,'events');
}catch(error){console.warn('Concert API unavailable; using stored concerts:',String(error))}
if(!concerts.length)throw Error('No concert data available; preserving history');
let added=0,baselineAdded=0,discovered=0;
for(const c of concerts){
 if(!c.artist||!c.venue||!c.date)continue;
 const key=keyOf(c),id=identity(c);
 if(Object.hasOwn(history,key))continue;
 const isKnown=known.has(id);
 const firstSeen=isKnown?known.get(id):baselineSources.has(c.source)?'':now;
 history[key]=firstSeen;
 known.set(id,firstSeen);
 added++;
 if(!firstSeen)baselineAdded++;else if(!isKnown)discovered++;
}
for(const source of baselineSources)history['__initialized__:'+source]=now;
await writeFile(path,JSON.stringify(history,null,2)+'\n');
console.log('Concert history:',Object.keys(history).length,'added:',added,'baselineAdded:',baselineAdded,'newlyDiscovered:',discovered,'baselineSources:',[...baselineSources].join(',')||'none');
