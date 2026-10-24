import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';

const configs=[
 {venue:'Royal Arena',base:'https://www.royalarena.dk',start:['https://www.royalarena.dk/shows','https://www.royalarena.dk/en/shows'],patterns:[/\/shows?\//i,/\/events?\//i,/\/all-events\//i]},
 {venue:'K.B. Hallen',base:'https://kbhallen.dk',start:['https://kbhallen.dk/kalender/'],patterns:[/\/event\//i,/\/koncert\//i]},
 {venue:'Amager Bio',base:'https://amagerbio.dk',start:['https://amagerbio.dk/','https://amagerbio.dk/program/'],patterns:[/\/event\//i,/\/koncert\//i,/\/events\//i]},
 {venue:'Bremen Teater',base:'https://www.brementeater.dk',start:['https://www.brementeater.dk/'],patterns:[/\/arrangementer\//i,/\/datoer\//i]},
 {venue:'Pumpehuset',base:'https://pumpehuset.dk',start:['https://pumpehuset.dk/','https://pumpehuset.dk/program/'],patterns:[/\/koncerter\//i]}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const today=new Date().toISOString().slice(0,10);
const normalize=(s)=>String(s||'').replace(/\s+/g,' ').trim();
const validUrl=(link,c)=>{try{const u=new URL(link,c.base);return u.hostname.replace(/^www\./,'')===new URL(c.base).hostname.replace(/^www\./,'')&&!/\.(?:jpg|png|pdf|svg|webp|zip)$/i.test(u.pathname)?u.href.split('#')[0]:null}catch{return null}};
const getJSON=()=>page.evaluate(()=>{
 const output=[];
 for(const tag of document.querySelectorAll('script[type="application/ld+json"]')){
  try{
   const parsed=JSON.parse(tag.textContent||'null');
   const walk=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return}if(/(?:MusicEvent|Event)/i.test([].concat(x['@type']||[]).join(' ')))output.push(x);if(x['@graph'])walk(x['@graph']);if(x.itemListElement)walk(x.itemListElement);if(x.item)walk(x.item);if(x.events)walk(x.events);if(x.mainEntity)walk(x.mainEntity)};
   walk(parsed);
  }catch{}
 }
 return output;
});
const monthMap={jan:1,feb:2,mar:3,apr:4,may:5,maj:5,jun:6,jul:7,aug:8,sep:9,okt:10,oct:10,nov:11,dec:12};
const toISO=(raw)=>{
 const s=normalize(raw);
 if(/^20\d\d-\d\d-\d\d/.test(s))return s.slice(0,10);
 const numeric=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d\d)\b/);if(numeric)return numeric[3]+'-'+numeric[2].padStart(2,'0')+'-'+numeric[1].padStart(2,'0');
 const m=s.match(/(\d{1,2})[.\s-]+(jan|feb|mar|apr|may|maj|jun|jul|aug|sep|okt|oct|nov|dec)[a-zæøå.]*[\s.,-]+(20\d\d)/i);
 const us=s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})[,\s]+(20\d\d)/i);if(us)return us[3]+'-'+String(monthMap[us[1].toLowerCase()]).padStart(2,'0')+'-'+us[2].padStart(2,'0');
 if(m)return m[3]+'-'+String(monthMap[m[2].toLowerCase()]).padStart(2,'0')+'-'+m[1].padStart(2,'0');
 return '';
};
const unique=new Map();
for(const config of configs){
 const urls=new Set(config.start);
 const calendarUrls=new Set();
 const sitemapQueue=[new URL('/sitemap.xml',config.base).href,new URL('/wp-sitemap.xml',config.base).href];
 const visited=new Set();
 while(sitemapQueue.length&&visited.size<18){
  const url=sitemapQueue.shift();if(visited.has(url))continue;visited.add(url);
  try{
   const response=await page.request.get(url,{timeout:13000});if(!response.ok())continue;
   const xml=await response.text();
   for(const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
    const link=match[1].replace(/&amp;/g,'&');const safe=validUrl(link,config);if(!safe)continue;
    if(/\.xml(?:\?|$)/i.test(safe))sitemapQueue.push(safe);
    else if(config.patterns.some(p=>p.test(new URL(safe).pathname)))urls.add(safe);
   }
  }catch{}
 }
 for(const start of config.start){
  try{
   await page.goto(start,{waitUntil:'domcontentloaded',timeout:22000});
   await page.waitForTimeout(2500);
   const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>a.href));
   for(const link of links){const safe=validUrl(link,config);if(safe&&config.patterns.some(p=>p.test(new URL(safe).pathname))){urls.add(safe);calendarUrls.add(safe)}}
  }catch(e){console.log('Calendar failed',config.venue,String(e).slice(0,120))}
 }
 let count=0;
 const candidates=[...new Set([...calendarUrls,...urls])].filter(u=>!config.start.includes(u));
 console.log(config.venue,'calendar links:',calendarUrls.size,'sitemap candidates:',urls.size,'scanning:',Math.min(candidates.length,config.venue==='Pumpehuset'?240:350));
 for(const url of candidates.slice(0,config.venue==='Pumpehuset'?240:350)){
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});if(!response?.ok())continue;
   const structured=await getJSON();
   const meta=await page.evaluate(()=>({
    title:document.querySelector('h1')?.textContent||document.querySelector('meta[property="og:title"]')?.content||'',
    image:document.querySelector('meta[property="og:image"]')?.content||'',
    datetime:document.querySelector('time[datetime]')?.getAttribute('datetime')||'',
    text:document.body.innerText.slice(0,6000)
   }));
   // Bremen event detail pages list individual performances, often without JSON-LD.
   // Each date/time is a separate event; comedy and talks are intentionally included.
   if(config.venue==='Bremen Teater' && /\\/arrangementer\\/[^/]+/i.test(new URL(url).pathname)){
    const dates=[...meta.text.matchAll(/\\b(\\d{1,2})\\.(\\d{1,2})\\.(20\\d{2})\\s+kl\\.\\s*(\\d{1,2}[.:]\\d{2})?/gi)];
    const title=normalize(meta.title);
    if(title && title.length<130 && !/^(?:arrangementer|program)$/i.test(title)){
     for(const match of dates){
      const date=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
      if(date<today)continue;
      const time=match[4]?match[4].replace('.',':').padStart(5,'0'):'';
      const near=meta.text.slice(match.index,match.index+110);
      const status=/udsolgt/i.test(near)?'Udsolgt':/venteliste/i.test(near)?'Venteliste':'Billetter';
      const key=['Bremen Teater',date,time,title.toLowerCase()].join('|');
      if(!unique.has(key)){unique.set(key,{id:'direct-'+key.toLowerCase().replace(/[^a-z0-9-]/g,'-'),artist:title,date,time,venue:'Bremen Teater',room:'Bremen Teater',genre:'Andet',status,url,image:meta.image||'',source:'Bremen Teater'});count++}
     }
    }
    continue;
   }
   const isEventPage=config.patterns.some(p=>p.test(new URL(url).pathname));
   const excluded=/\b(?:sports?|mma|boxing|wrestling|comedy|stand.?up|foredrag|galla|globetrotters)\b/i;
   const bremenMusic=/\b(?:music|musik|koncert|jazz|blues|rock|pop|folk|soul|band|orchestra|orkester|singer|songwriter|festival|tour)\b/i;
   const events=structured.filter(e=>isEventPage && (config.venue==='Bremen Teater'||!excluded.test(String(e.name||''))) && /(?:MusicEvent|Event)/i.test([].concat(e['@type']||[]).join(' ')));
   if(!events.length && config.venue==='Pumpehuset' && /\/koncerter\/[^/]+/i.test(new URL(url).pathname)){
    const match=meta.text.match(/\b(\d{1,2})[.]?\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zæøå]*\s+20\d\d\b/i);
    if(match&&!excluded.test(meta.title)&&/showet starter|dørene åbner/i.test(meta.text))events.push({name:meta.title,startDate:match[0]});
   }
   if(!events.length && config.venue==='Royal Arena' && /\/all-events\//i.test(new URL(url).pathname)){
    const match=meta.text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|okt|nov|dec)\s+\d{1,2}\s+20\d\d/i);
    if(match&&!excluded.test(meta.title))events.push({name:meta.title,startDate:match[0]});
   }
   if(!events.length && config.venue==='K.B. Hallen' && /\/event\//i.test(new URL(url).pathname))events.push({name:meta.title,startDate:meta.datetime});
   for(const e of events){
    const rawDate=e.startDate||meta.datetime||meta.text.slice(0,1000);
    const date=toISO(rawDate);if(!date||date<today)continue;
    const name=normalize(e.name||meta.title).replace(/\s*[|–-]\s*(?:Pumpehuset|Royal Arena|Amager Bio)\s*$/i,'').replace(/\s*[|–]\s*(?:Royal Arena|K\.B\. Hallen|Amager Bio|Pumpehuset).*$/i,'');
    const artist=config.venue==='Pumpehuset'?name.replace(/\s+giver koncert i Pumpehuset\s*$/i,'').trim():name;
    if(!artist||artist.length>130||/^(?:program|kalender|koncerter|shows|events)$/i.test(name)||(config.venue!=='Bremen Teater'&&/\b(?:MMA|wrestling|boxing|stand.?up|foredrag)\b/i.test(name)))continue;
    const location=normalize(e.location?.name||e.location?.[0]?.name||'');
    const venue=config.venue==='Amager Bio'&&/\bbeta\b/i.test(location)?'':config.venue;
    if(!venue)continue;
    const start=String(e.startDate||meta.datetime||'');
    const time=/T(\d\d:\d\d)/.exec(start)?.[1]||'';
    const urlValue=validUrl(e.url||url,config)||url;
    const image=typeof e.image==='string'?e.image:Array.isArray(e.image)?(typeof e.image[0]==='string'?e.image[0]:e.image[0]?.url):e.image?.url||meta.image;
    const status=/sold.?out|udsolgt/i.test(JSON.stringify(e.offers||'')+' '+meta.text.slice(0,900))?'Udsolgt':'Billetter';
    const key=[venue,date,time,artist.toLowerCase()].join('|');
    if(!unique.has(key)){unique.set(key,{id:'direct-'+key.toLowerCase().replace(/[^a-z0-9-]/g,'-'),artist,date,time,venue,room:venue,genre:'Andet',status,url:urlValue,image:image||'',source:config.venue});count++}
   }
  }catch(e){console.log('Skipped',config.venue,url,String(e).slice(0,80))}
 }

 // Amager Bio's own site does not expose individual concert URLs to this crawler.
 // Use its dedicated Ticketmaster venue calendar as a verified secondary source.
 if(config.venue==='Amager Bio'){
  const calendar='https://www.ticketmaster.dk/venue/amager-bio-kobenhavn-s-billetter/ama/203?language=en-us';
  for(let index=0;index<4;index++){
   try{
    const response=await page.goto(calendar+'&page='+index,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response?.ok())continue;
    await page.waitForTimeout(1200);
    const listings=await page.evaluate(()=>{
     const results=[];
     const anchors=[...document.querySelectorAll('a[href*="/event/"]')];
     for(const a of anchors){
      const container=a.closest('li,article,[data-testid*="event"],[class*="event-listing"],[class*="eventList"]')||a.parentElement?.parentElement;
      const text=(container?.innerText||a.innerText||'').replace(/\\s+/g,' ').trim();
      const title=(a.getAttribute('aria-label')||a.innerText||'').replace(/\\s+/g,' ').trim();
      results.push({url:a.href,text,title,image:container?.querySelector('img')?.src||''});
     }
     return results;
    });
    console.log('Amager Bio Ticketmaster page',index,'candidate links:',listings.length);
    for(const entry of listings){
     const combined=entry.title+' '+entry.text;
     const dateMatch=combined.match(/\\b(\\d{1,2})[.\\/-](\\d{1,2})[.\\/-](20\\d\\d)\\b/);
     const english=combined.match(/\\b(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(20\\d\\d)\\b/i);
     const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
     const date=dateMatch?dateMatch[3]+'-'+dateMatch[2].padStart(2,'0')+'-'+dateMatch[1].padStart(2,'0'):english?english[3]+'-'+String(months[english[2].toLowerCase()]).padStart(2,'0')+'-'+english[1].padStart(2,'0'):'';
     if(!date||date<today||/\\b(cancelled|postponed|aflyst|udskudt|comedy|stand-up)\\b/i.test(combined))continue;
     const name=entry.title.replace(/^.*?(?:information for|for)\\s+/i,'').replace(/,?\\s*\\d{1,2}[.\\/-]\\d{1,2}[.\\/-]20\\d\\d.*$/,'').replace(/\\s*[-–|]\\s*Amager Bio.*$/i,'').trim();
     if(!name||name.length>120||/^(find tickets|buy tickets|event info)$/i.test(name))continue;
     const timeMatch=combined.match(/(?:20\\d\\d[,\\s]+|,\\s*)(\\d{1,2})[.:](\\d{2})\\b/);
     const time=timeMatch?timeMatch[1].padStart(2,'0')+':'+timeMatch[2]:'';
     const key=['Amager Bio',date,time,name.toLowerCase()].join('|');
     if(!unique.has(key)){unique.set(key,{id:'direct-'+key.toLowerCase().replace(/[^a-z0-9-]/g,'-'),artist:name,date,time,venue:'Amager Bio',room:'Amager Bio',genre:'Andet',status:/sold out|udsolgt/i.test(combined)?'Udsolgt':'Billetter',url:entry.url,image:entry.image,source:'Amager Bio'});count++}
    }
   }catch(error){console.log('Amager Bio Ticketmaster failed page',index,String(error).slice(0,160))}
  }
 }
 console.log(config.venue,'discovered:',urls.size,'parsed:',count);
}
await browser.close();
if(!unique.size){console.error('No verified events from any venue; preserving previous data');process.exitCode=1}
else{
 const file='data/direct-venues.json';
 let old=[];try{old=JSON.parse(await readFile(file,'utf8'))}catch{}
 const updatedVenues=new Set([...unique.values()].map(c=>c.venue));
 const retained=old.filter(c=>!updatedVenues.has(c.venue)&&c.date>=today&&c.url!==new URL('/',configs.find(x=>x.venue===c.venue)?.base||'https://pumpehuset.dk').href);
 const result=[...unique.values(),...retained].sort((a,b)=>a.date.localeCompare(b.date));
 await writeFile(file,JSON.stringify(result,null,2)+'\n');
 console.log('Saved:',result.length,'previous venues retained:',retained.length);
}
