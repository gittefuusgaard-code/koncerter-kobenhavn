import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const entries=new Map();
const today=new Date().toISOString().slice(0,10);
const seeds=['https://vega.dk/event/malk-de-koijn-ekstrakoncert-2026-12-12'];
const discovered=new Map(seeds.map(url=>[url,'9999-12-31']));
const fetchText=async url=>{try{const r=await page.request.get(url,{timeout:18000});return r.ok()?await r.text():''}catch{return ''}};
const sitemapQueue=['https://vega.dk/sitemap.xml','https://vega.dk/sitemap_index.xml'];
const visited=new Set();
while(sitemapQueue.length&&visited.size<35){
 const url=sitemapQueue.shift();if(visited.has(url))continue;visited.add(url);
 const xml=await fetchText(url);if(!xml)continue;
 for(const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
  const link=match[1].replace(/&amp;/g,'&');
  if(/\.xml(?:\?|$)/i.test(link)&&/vega\.dk/.test(link))sitemapQueue.push(link);
  if(/vega\.dk\/(?:en\/)?event\//.test(link)){
   const block=xml.slice(Math.max(0,match.index-200),match.index+500);
   const lastmod=block.match(/<lastmod>([^<]+)/)?.[1]||'';
   discovered.set(link,lastmod);
  }
 }
}
try{
 await page.goto('https://vega.dk/',{waitUntil:'domcontentloaded',timeout:30000});
 const links=await page.locator('a[href*="/event/"]').evaluateAll(nodes=>nodes.map(n=>n.href));
 for(const link of links)if(/vega\.dk\/event\//.test(link))discovered.set(link,'9999-12-30');
}catch(e){console.log('VEGA calendar unavailable:',String(e).slice(0,100))}
const urls=[...discovered].sort((a,b)=>b[1].localeCompare(a[1])).map(([url])=>url).slice(0,220);
console.log('VEGA sitemap pages:',visited.size,'event links:',discovered.size,'checking:',urls.length);
for(const url of urls){
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:14000});
  if(!response?.ok())continue;
  const item=await page.evaluate(()=>{
   const h=document.querySelector('h1')?.textContent?.trim()||'';
   const text=document.body.innerText;
   const date=text.match(/(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)?\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})/i);
   const venue=/\bS\s+Store VEGA\b|\bStore VEGA\b/.test(text.slice(0,1500))?'Store VEGA':/\bL\s+Lille VEGA\b|\bLille VEGA\b/.test(text.slice(0,1500))?'Lille VEGA':'';
   const time=text.match(/Koncertstart:\s*(\d{1,2})[.:](\d{2})/i);
   const image=document.querySelector('meta[property="og:image"]')?.getAttribute('content')||'';
   const genre=document.querySelector('meta[property="article:tag"]')?.getAttribute('content')||'';
   return {h,date:date?.slice(1)||[],venue,time:time?time[1].padStart(2,'0')+':'+time[2]:'',image,genre,status:/Udsolgt/.test(text.slice(0,1100))?'Udsolgt':'Billetter'};
  });
  if(!item.h||!item.venue||item.date.length!==3)continue;
  const date=item.date[2]+'-'+item.date[1].padStart(2,'0')+'-'+item.date[0].padStart(2,'0');
  if(date<today)continue;
  const artist=item.h.replace(/\s*[-–]\s*Ekstrakoncert$/i,'').trim();
  const key=[item.venue,date,artist.toLowerCase()].join('|');
  entries.set(key,{id:'vega-'+key.toLowerCase().replace(/[^a-z0-9-]/g,'-'),artist,date,time:item.time,venue:item.venue,room:item.venue,genre:item.genre||'Andet',status:item.status,url,image:item.image,source:'VEGA'});
 }catch(e){console.log('VEGA skip:',url,String(e).slice(0,75))}
}
await browser.close();
if(entries.size===0){console.error('No VEGA events found; preserving previous file');process.exitCode=1}
else{await mkdir('data',{recursive:true});await writeFile('data/vega-concerts.json',JSON.stringify([...entries.values()].sort((a,b)=>a.date.localeCompare(b.date)),null,2)+'\n');console.log('Saved VEGA events:',entries.size)}
