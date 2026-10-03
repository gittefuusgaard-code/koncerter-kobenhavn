import {NextResponse} from 'next/server';
type Concert={id:string;artist:string;date:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

const decode=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const iso=(d:string)=>{const m=d.match(/(\d{2})\.(\d{2})\.(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};

function parseVega(html:string):Concert[]{
 const out:Concert[]=[];
 const headings=[...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
 for(let i=0;i<headings.length;i++){
  const artist=decode(headings[i][1]); if(!artist||/vil du være/i.test(artist)) continue;
  const start=(headings[i].index||0)+headings[i][0].length;
  const end=i+1<headings.length?(headings[i+1].index||html.length):html.length;
  const block=html.slice(start,end);
  const text=decode(block);
  const dm=text.match(/(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+(Store VEGA|Lille VEGA|Ideal Bar|Loppen)(?:\s|$)/i);
  if(!dm) continue;
  const date=iso(dm[1]);
  const room=dm[3];
  const beforeVenue=dm[2].trim();
  const genre=beforeVenue.split(/Køb billet|Udsolgt|Venteliste|Læs mere/i).pop()?.trim()||'Musik';
  if(!date||date<new Date().toISOString().slice(0,10)||/andre arrangementer/i.test(genre)) continue;
  const links=[...block.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const ticket=links.find(x=>/køb billet|udsolgt|venteliste/i.test(decode(x[2])));
  const detail=links.find(x=>/læs mere/i.test(decode(x[2])));
  const img=block.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  const status=/udsolgt/i.test(decode(block))?'Udsolgt':/venteliste/i.test(decode(block))?'Venteliste':'Billetter';
  let url=(detail?.[1]||ticket?.[1]||'https://vega.dk/');
  if(url.startsWith('/')) url='https://vega.dk'+url;
  out.push({id:'vega-'+date+'-'+artist.toLowerCase().replace(/[^a-z0-9]+/g,'-'),artist,date,venue:room,room,genre,status,url,image:img?.[1]||'',source:'VEGA'});
 }
 return out;
}

async function getVega(){
 const r=await fetch('https://vega.dk/',{headers:{'User-Agent':'Mozilla/5.0'},next:{revalidate:1800}});
 if(!r.ok)return[]; return parseVega(await r.text());
}
async function getTicketmaster(){
 const key=process.env.TICKETMASTER_API_KEY;if(!key)return[];
 const p=new URLSearchParams({apikey:key,city:'Copenhagen',countryCode:'DK',classificationName:'music',startDateTime:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),size:'200',sort:'date,asc'});
 const all:any[]=[];
 for(let page=0;page<10;page++){
  p.set('page',String(page));
  const r=await fetch('https://app.ticketmaster.com/discovery/v2/events.json?'+p,{next:{revalidate:1800}});if(!r.ok)break;
  const d=await r.json(); const events=d?._embedded?.events||[]; all.push(...events);
  if(page>=((d?.page?.totalPages||1)-1)) break;
 }
 return all.map((e:any)=>({id:'tm-'+e.id,artist:e._embedded?.attractions?.[0]?.name||e.name,date:e.dates?.start?.localDate||'',venue:e._embedded?.venues?.[0]?.name||'',room:e._embedded?.venues?.[0]?.name||'',genre:e.classifications?.[0]?.genre?.name||'Musik',status:e.dates?.status?.code==='offsale'?'Udsolgt':'Billetter',url:e.url||'',image:[...(e.images||[])].sort((a:any,b:any)=>(b.width||0)-(a.width||0))[0]?.url||'',source:'Ticketmaster'}));
}
export async function GET(){
 const[vega,tm]=await Promise.all([getVega(),getTicketmaster()]);
 const keys=new Set(vega.map(c=>(c.artist+'|'+c.date).toLowerCase()));
 const merged=[...vega,...tm.filter((c:Concert)=>!/vega|ideal bar/i.test(c.venue)||!keys.has((c.artist+'|'+c.date).toLowerCase()))].filter((c:Concert)=>c.date).sort((a:Concert,b:Concert)=>a.date.localeCompare(b.date));
 return NextResponse.json({concerts:merged,counts:{vega:vega.length,ticketmaster:tm.length,total:merged.length},diagnostics:{vegaWorking:vega.length>0},updatedAt:new Date().toISOString()});
}