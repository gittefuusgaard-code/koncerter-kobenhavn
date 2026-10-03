import {NextResponse} from 'next/server';

type Concert={id:string;artist:string;date:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

function strip(s:string){return s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}

function parseVega(html:string):Concert[]{
 const jsonLd=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 const out:Concert[]=[];
 for(const m of jsonLd){
  try{
   const raw=JSON.parse(m[1]);
   const items=Array.isArray(raw)?raw:[raw];
   for(const x of items){
    const candidates=x?.['@graph']||[x];
    for(const e of candidates){
     if(!['MusicEvent','Event'].includes(e?.['@type'])) continue;
     const name=strip(e.name||''); const start=String(e.startDate||'');
     const loc=typeof e.location==='object'?e.location?.name:'';
     if(!name||!start) continue;
     const date=start.slice(0,10);
     if(date<new Date().toISOString().slice(0,10)) continue;
     const venue=String(loc||'VEGA');
     if(!/vega|ideal bar/i.test(venue)) continue;
     out.push({id:'vega-'+(e['@id']||e.url||name+'-'+date),artist:name,date,venue,room:venue,genre:'Musik',status:'Billetter',url:e.url||'https://vega.dk/',image:typeof e.image==='string'?e.image:e.image?.url||'',source:'VEGA'});
    }
   }
  }catch{}
 }
 return out;
}

async function getVega(){
 const res=await fetch('https://vega.dk/',{headers:{'User-Agent':'Mozilla/5.0 ConcertCalendar/1.0'},next:{revalidate:1800}});
 if(!res.ok) return [];
 const html=await res.text();
 return parseVega(html);
}

async function getTicketmaster(){
 const key=process.env.TICKETMASTER_API_KEY; if(!key) return [];
 const p=new URLSearchParams({apikey:key,city:'Copenhagen',countryCode:'DK',classificationName:'music',startDateTime:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),size:'200',sort:'date,asc'});
 const r=await fetch('https://app.ticketmaster.com/discovery/v2/events.json?'+p,{next:{revalidate:1800}}); if(!r.ok)return[];
 const d=await r.json();
 return (d?._embedded?.events||[]).map((e:any)=>({id:'tm-'+e.id,artist:e._embedded?.attractions?.[0]?.name||e.name,date:e.dates?.start?.localDate||'',venue:e._embedded?.venues?.[0]?.name||'',room:e._embedded?.venues?.[0]?.name||'',genre:e.classifications?.[0]?.genre?.name||'Musik',status:e.dates?.status?.code==='offsale'?'Udsolgt':'Billetter',url:e.url||'',image:[...(e.images||[])].sort((a:any,b:any)=>(b.width||0)-(a.width||0))[0]?.url||'',source:'Ticketmaster'}));
}

export async function GET(){
 const [vega,tm]=await Promise.all([getVega(),getTicketmaster()]);
 const vegaKeys=new Set(vega.map(c=>(c.artist+'|'+c.date).toLowerCase()));
 const merged=[...vega,...tm.filter((c:Concert)=>!/vega|ideal bar/i.test(c.venue)||!vegaKeys.has((c.artist+'|'+c.date).toLowerCase()))].filter((c:Concert)=>c.date).sort((a:Concert,b:Concert)=>a.date.localeCompare(b.date));
 return NextResponse.json({concerts:merged,counts:{vega:vega.length,ticketmaster:tm.length},updatedAt:new Date().toISOString()});
}
