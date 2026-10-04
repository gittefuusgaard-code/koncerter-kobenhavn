import {NextResponse} from 'next/server';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

const VENUES=[
 'Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen',
 'Forum Copenhagen','DR Koncerthuset','Koncerthuset','Amager Bio',
 'Pumpehuset','Poolen','Loppen'
];

const JAMBASE_VENUES=[
 'Royal Arena','KB Hallen','Store VEGA','Lille VEGA','Scandic Falkoner',
 'Forum Copenhagen','DR Koncerthuset','Koncerthuset','Amager Bio',
 'Pumpehuset','Poolen','Loppen'
];

const venueAliases:Record<string,string[]>={
 'Royal Arena':['royal arena'],
 'K.B. Hallen':['k.b. hallen','kb hallen','k.b hallen'],
 'Store VEGA':['store vega'],
 'Lille VEGA':['lille vega'],
 'Falkonersalen':['falkonersalen','falkoner salen','scandic falkoner'],
 'Forum Copenhagen':['forum copenhagen','forum københavn'],
 'DR Koncerthuset':['dr koncerthuset','koncerthuset'],
 'Amager Bio':['amager bio'],
 'Pumpehuset':['pumpehuset'],
 'Poolen':['poolen'],
 'Loppen':['loppen']
};

const canonicalVenue=(name:string)=>{
 const n=name.toLowerCase().trim();
 for(const [venue,aliases] of Object.entries(venueAliases)){
  if(aliases.some(alias=>n===alias||n.includes(alias))) return venue;
 }
 return '';
};

const artistName=(event:any)=>{
 const performers=event.performer||event.performers||[];
 if(Array.isArray(performers)&&performers.length) return performers.map((p:any)=>p?.name).filter(Boolean).join(', ');
 const title=String(event.name||'');
 return title.replace(/\s+at\s+.+$/i,'').trim()||title;
};

const ticketUrl=(event:any)=>{
 const links=event.ticketLinks||event.offers||[];
 if(Array.isArray(links)){
  const first=links.find((x:any)=>x?.url)?.url;
  if(first) return first;
 }
 return event.url||'';
};

function toConcert(event:any):Concert|null{
 const venueRaw=event.location?.name||event.venue?.name||'';
 const venue=canonicalVenue(venueRaw);
 if(!venue) return null;
 const start=String(event.startDate||'');
 if(!start) return null;
 const date=start.slice(0,10);
 const time=start.includes('T')?start.slice(11,16):undefined;
 const status=String(event.eventStatus||'scheduled').toLowerCase();
 if(status.includes('cancel')) return null;
 return {
  id:String(event.identifier||event.id||venue+'-'+start+'-'+event.name),
  artist:artistName(event),
  date,time,
  venue,room:venue,
  genre:'Musik',
  status:status.includes('postpon')?'Udskudt':status.includes('resched')?'Flyttet':'Billetter',
  url:ticketUrl(event),
  image:typeof event.image==='string'?event.image:Array.isArray(event.image)?event.image[0]||'':'',
  source:'JamBase'
 };
}

export async function GET(){
 const key=process.env.JAMBASE_API_KEY;
 if(!key) return NextResponse.json({concerts:[],error:'JAMBASE_API_KEY mangler',updatedAt:new Date().toISOString()},{status:500});

 const params=new URLSearchParams({
  venueName:JAMBASE_VENUES.join('|'),
  eventDateFrom:new Date().toISOString().slice(0,10),
  perPage:'100',
  page:'1'
 });

 try{
  const response=await fetch('https://api.data.jambase.com/v3/events?'+params.toString(),{
   headers:{Authorization:'Bearer '+key,Accept:'application/json','User-Agent':'Koncerter-Kobenhavn/1.0'},
   next:{revalidate:21600}
  });
  const data=await response.json();
  if(!response.ok) return NextResponse.json({concerts:[],error:'JamBase request fejlede',details:data,updatedAt:new Date().toISOString()},{status:response.status});

  const concerts=(data.events||[]).map(toConcert).filter(Boolean).sort((a:Concert,b:Concert)=>a.date.localeCompare(b.date));
  return NextResponse.json({
   concerts,
   counts:{total:concerts.length,received:data.events?.length||0},
   source:'JamBase',
   attribution:'Powered by JamBase',
   updatedAt:new Date().toISOString()
  });
 }catch(error){
  return NextResponse.json({concerts:[],error:'Kunne ikke hente koncertdata',updatedAt:new Date().toISOString()},{status:500});
 }
}
