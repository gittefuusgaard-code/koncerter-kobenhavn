import {NextResponse} from 'next/server';

const allowedVenues=['Royal Arena','K.B. Hallen','Falkonersalen','Forum Copenhagen','DR Koncerthuset','Amager Bio','Pumpehuset','Poolen','Loppen','VEGA','Store VEGA','Lille VEGA'];

export async function GET(){
 const key=process.env.TICKETMASTER_API_KEY;
 if(!key) return NextResponse.json({error:'TICKETMASTER_API_KEY mangler'},{status:500});
 const params=new URLSearchParams({apikey:key,city:'Copenhagen',countryCode:'DK',classificationName:'music',size:'200',sort:'date,asc'});
 const res=await fetch('https://app.ticketmaster.com/discovery/v2/events.json?'+params.toString(),{next:{revalidate:3600}});
 if(!res.ok) return NextResponse.json({error:'Ticketmaster kunne ikke hentes'},{status:502});
 const data=await res.json();
 const events=(data?._embedded?.events||[]).map((e:any)=>{
   const v=e._embedded?.venues?.[0];
   const venue=v?.name||'';
   const attraction=e._embedded?.attractions?.[0];
   const genre=e.classifications?.[0]?.genre?.name||e.classifications?.[0]?.segment?.name||'Musik';
   const image=[...(e.images||[])].sort((a:any,b:any)=>(b.width||0)-(a.width||0))[0]?.url||'';
   return {id:e.id,artist:attraction?.name||e.name,date:e.dates?.start?.localDate||'',time:e.dates?.start?.localTime||'',venue,room:venue,genre,status:e.dates?.status?.code==='offsale'?'Udsolgt':'Billetter',url:e.url||'',image};
 }).filter((e:any)=>allowedVenues.some(v=>e.venue.toLowerCase().includes(v.toLowerCase())||v.toLowerCase().includes(e.venue.toLowerCase())));
 return NextResponse.json({concerts:events});
}
