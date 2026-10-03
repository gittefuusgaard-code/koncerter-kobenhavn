import {NextResponse} from 'next/server';

const venueAliases=[
 {label:'Royal Arena',matches:['royal arena']},
 {label:'K.B. Hallen',matches:['k.b. hallen','kb hallen']},
 {label:'Falkonersalen',matches:['falkonersalen','falkoner salen']},
 {label:'Forum Copenhagen',matches:['forum copenhagen','forum black box','forum københavn']},
 {label:'DR Koncerthuset',matches:['dr koncerthuset','koncertsalen']},
 {label:'Amager Bio',matches:['amager bio']},
 {label:'Pumpehuset',matches:['pumpehuset']},
 {label:'Poolen',matches:['poolen']},
 {label:'Loppen',matches:['loppen']},
 {label:'Store VEGA',matches:['store vega']},
 {label:'Lille VEGA',matches:['lille vega']},
 {label:'VEGA',matches:['vega']}
];

const packageWords=['upgrade','package','vip','parking','parkering','lounge','hospitality'];

export async function GET(){
 const key=process.env.TICKETMASTER_API_KEY;
 if(!key) return NextResponse.json({error:'TICKETMASTER_API_KEY mangler'},{status:500});

 const now=new Date();
 const startDateTime=now.toISOString().replace(/\.\d{3}Z$/,'Z');
 const params=new URLSearchParams({
   apikey:key,
   city:'Copenhagen',
   countryCode:'DK',
   classificationName:'music',
   startDateTime,
   size:'200',
   sort:'date,asc'
 });

 const res=await fetch('https://app.ticketmaster.com/discovery/v2/events.json?'+params.toString(),{next:{revalidate:1800}});
 if(!res.ok){
   const detail=await res.text();
   return NextResponse.json({error:'Ticketmaster kunne ikke hentes',detail:detail.slice(0,300)},{status:502});
 }
 const data=await res.json();

 const concerts=(data?._embedded?.events||[])
  .filter((e:any)=>{
    const segment=(e.classifications?.[0]?.segment?.name||'').toLowerCase();
    const name=(e.name||'').toLowerCase();
    return segment==='music' && !packageWords.some(word=>name.includes(word));
  })
  .map((e:any)=>{
    const rawVenue=e._embedded?.venues?.[0]?.name||'';
    const lower=rawVenue.toLowerCase();
    const match=venueAliases.find(v=>v.matches.some(alias=>lower.includes(alias)));
    if(!match) return null;
    const attraction=e._embedded?.attractions?.[0];
    const genre=e.classifications?.[0]?.genre?.name||'Musik';
    const image=[...(e.images||[])].sort((a:any,b:any)=>(b.width||0)-(a.width||0))[0]?.url||'';
    const code=e.dates?.status?.code||'';
    return {
      id:e.id,
      artist:attraction?.name||e.name,
      title:e.name,
      date:e.dates?.start?.localDate||'',
      time:e.dates?.start?.localTime||'',
      venue:match.label,
      room:rawVenue,
      genre,
      status:code==='offsale'||code==='cancelled'?'Udsolgt':'Billetter',
      url:e.url||'',
      image,
      source:'Ticketmaster'
    };
  })
  .filter(Boolean);

 return NextResponse.json({concerts,updatedAt:new Date().toISOString()});
}
