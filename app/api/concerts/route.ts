import {NextResponse} from 'next/server';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

const VENUES=[
 'Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen',
 'Forum Copenhagen','DR Koncerthuset','Koncerthuset','Amager Bio',
 'Pumpehuset','Poolen','Loppen'
];

const normaliseVenue=(name:string)=>{
 if(/^koncerthuset$/i.test(name)) return 'DR Koncerthuset';
 return name;
};

const allowedVenue=(name:string)=>VENUES.some(v=>name.toLowerCase().includes(v.toLowerCase()));

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
 if(!venueRaw||!allowedVenue(venueRaw)) return null;
 const venue=normaliseVenue(venueRaw);
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
  geoCityName:'Copenhagen',
  geoCountryIso2:'DK',
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
