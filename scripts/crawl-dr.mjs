import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'da-DK', userAgent: 'Mozilla/5.0 (compatible; ConcertCalendarBot/1.0)' });
const found = new Map();
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
      const pages = [origin, ...links.filter(u => u !== origin).slice(0,100)];
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
  console.error('No DR events found; preserving last successful dataset');
  process.exitCode = 1;
} else {
  await mkdir('data', {recursive:true});
  await writeFile('data/dr-concerts.json', JSON.stringify([...found.values()].sort((a,b)=>a.date.localeCompare(b.date)),null,2)+'\n');
  console.log('Saved DR concerts:',found.size);
}
