import {readFile,writeFile} from 'node:fs/promises';
const endpoint=process.env.CONCERTS_API_URL || 'https://koncerter-kobenhavn-git-main-gitte.vercel.app/api/concerts';
const response=await fetch(endpoint,{headers:{'Cache-Control':'no-cache'}});
if(!response.ok) throw new Error('Concert API HTTP '+response.status);
const payload=await response.json();
if(!Array.isArray(payload.concerts)||payload.concerts.length===0) throw new Error('No concerts returned; preserving history');
const path='data/concert-history.json';
const history=JSON.parse(await readFile(path,'utf8'));
const now=new Date().toISOString();
const keyOf=c=>[c.venue,c.date,c.time||'',c.artist.toLowerCase().trim()].join('|');
const baseline=Object.keys(history).length===0;
let added=0;
for(const c of payload.concerts){
  const key=keyOf(c);
  if(!history[key]) {history[key]=baseline?'':now;added++;}
}
await writeFile(path,JSON.stringify(history,null,2)+'\n');
console.log('Concert history:',Object.keys(history).length,'added:',added,'baseline:',baseline);
