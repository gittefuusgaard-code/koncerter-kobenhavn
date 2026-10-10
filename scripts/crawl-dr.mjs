import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'da-DK', userAgent: 'Mozilla/5.0 (compatible; ConcertCalendarBot/1.0)' });
const found = new Map();
const diagnostics = [];
const capturedResponses = [];
page.on('response', response => {const url=response.url();if(/drkoncerthuset|billetter\.drkoncerthuset/.test(url)&&/json|api|event|calendar|kalender|search|itix/i.test(url)) capturedResponses.push({status:response.status(),url:url.slice(0,350),type:response.headers()['content-type']||''});});
const origins = ['https://www.drkoncerthuset.dk/kalender/', 'https://billet.drkoncerthuset.dk/kalender/'];
const extract = (item, base) => {
  if (!item || typeof item !== 'object') return;
  if (Array.isArray(item)) { for (const x of item) extract(x, base); return; }
  if (item['@graph']) extract(item['@graph'], base);
  const type = String(item['@type'] || item.type || '');
  if (/MusicEvent|Event/i.test(type) && item.startDate && item.name) {
    const loc = typeof item.location === 'string' ? item.location : item.location?.name || '';
    const name = String(item.name).trim();
    const start = String(item.startDate);
    const date = start.slice(0, 10);
    if (date >= new Date().toISOString().slice(0, 10) && /koncert|studie|dr |salen/i.test(loc + ' ' + base)) {
      const url = String(item.url || base);
      const image = typeof item.image === 'string' ? item.image : item.image?.url || item.image?.[0] || '';
      const status = /soldout|udsolgt/i.test(JSON.stringify(item.offers || '')) ? 'Udsolgt' : 'Billetter';
      found.set([name,date,start.slice(11,16)].join('|'), {
        id: 'dr-' + [name,date,start.slice(11,16)].join('-').toLowerCase().replace(/[^a-z0-9-]/g,'-'),
        artist: name, date, time: start.includes('T') ? start.slice(11,16) : '',
        venue: 'DR Koncerthuset', room: loc || 'DR Koncerthuset',
        genre: String(item.genre || 'Andet'), status, url, image: String(image),
        source: 'DR Koncerthuset'
      });
    }
  }
  for (const [k,v] of Object.entries(item)) {
    if (k !== '@graph' && v && typeof v === 'object') extract(v, base);
  }
};
try {
  for (const origin of origins) {
    try {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
      console.log('DR page', origin, response?.status());
      await page.waitForTimeout(5000);
      const links = await page.locator('a[href]').evaluateAll(nodes =>
        [...new Set(nodes.map(n => n.href).filter(u => /drkoncerthuset\.dk/.test(u) && /koncert|event|arrangement|kalender/i.test(u)))].slice(0,250));
      // DR's calendar contains rendered event cards even when JSON-LD is absent.
      const cards = await page.evaluate(() => {
        const dateRe = /(?:0?[1-9]|[12][0-9]|3[01])\\.\\s*(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\\s+20\\d{2}\\s+KL\\.?\\s*\\d{1,2}[.:]\\d{2}/i;
        const out = [];
        for (const el of document.querySelectorAll('a[href]')) {
          const href = el.href;
          if (!/drkoncerthuset\\.dk\\/kalender\\/20\\d{2}\\//.test(href)) continue;
          let node = el;
          for (let i=0;i<5 && node;i++,node=node.parentElement) {
            const t = (node.innerText||'').trim();
            if (t.length>25 && t.length<1300 && dateRe.test(t)) {
              out.push({url:href,text:t,heading:node.querySelector('h2,h3,h4')?.innerText||'',image:node.querySelector('img')?.src||''});
              break;
            }
          }
        }
        return out;
      });
      const months={januar:'01',februar:'02',marts:'03',april:'04',maj:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',december:'12'};
      for (const card of cards) {
        const m=card.text.match(/(\\d{1,2})\\.\\s*(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\\s+(20\\d{2})\\s+KL\\.?\\s*(\\d{1,2})[.:](\\d{2})/i);
        if(!m) continue;
        const date=m[3]+'-'+months[m[2].toLowerCase()]+'-'+m[1].padStart(2,'0');
        if(date<new Date().toISOString().slice(0,10)) continue;
        const room=(card.text.match(/Koncertsalen|Studie\\s*[1-4]/i)||[])[0]||'';
        if(!room) continue;
        let name=card.heading.trim();
        if(!name) {
          const lines=card.text.split('\\n').map(x=>x.trim()).filter(Boolean);
          name=lines.find(x=>x.length>3&&!/^(Koncertsalen|Studie|Læs mere|Køb|Venteliste|Udsolgt|Få billetter|\\d)/i.test(x)&&!x.includes('KL.'))||'';
        }
        if(!name||/stand.?up|comedy|dylan moran|gianmarco soresi|talkshow|roadshow/i.test(name))continue;
        const time=m[4].padStart(2,'0')+':'+m[5];
        found.set([name,date,time].join('|'),{id:'dr-'+[name,date,time].join('-').toLowerCase().replace(/[^a-z0-9-]/g,'-'),artist:name,date,time,venue:'DR Koncerthuset',room,genre:'Andet',status:/udsolgt/i.test(card.text)?'Udsolgt':/venteliste/i.test(card.text)?'Venteliste':'Billetter',url:card.url,image:card.image,source:'DR Koncerthuset'});
      }
      console.log('DR rendered cards:',cards.length,'matched:',found.size);
      const pages = [origin, ...links.filter(u => u !== origin).slice(0,100)];
      diagnostics.push({origin,status:response?.status(),title:await page.title(),links:links.length,sampleLinks:links.slice(0,15),text:(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000),responses:capturedResponses.slice(-60)});
      for (const url of pages) {
        try {
          if (url !== origin) await page.goto(url, {waitUntil:'domcontentloaded',timeout:20000});
          const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
          for (const script of scripts) { try { extract(JSON.parse(script), url); } catch {} }
          console.log('Parsed', url, 'total', found.size);
        } catch (e) { console.log('Skip',url,String(e).slice(0,120)); }
      }
    } catch (e) { console.log('Source failed',origin,String(e).slice(0,200)); }
    if (found.size) break;
  }
} finally { await browser.close(); }
if (!found.size) {
  await mkdir('artifacts', {recursive:true});
  await writeFile('artifacts/dr-diagnostics.json',JSON.stringify({diagnostics,responses:capturedResponses.slice(-150)},null,2));
  console.error('No DR events found; diagnostics saved to artifacts/dr-diagnostics.json; preserving last successful dataset');
  console.log(JSON.stringify({diagnostics:diagnostics.map(({text,...rest})=>({...rest,text:text.slice(0,1200)})),responses:capturedResponses.slice(-30)},null,2));
  process.exitCode = 1;
} else {
  await mkdir('data', {recursive:true});
  await writeFile('data/dr-concerts.json', JSON.stringify([...found.values()].sort((a,b)=>a.date.localeCompare(b.date)),null,2)+'\n');
  console.log('Saved DR concerts:',found.size);
}
