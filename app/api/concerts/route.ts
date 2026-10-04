import {NextResponse} from 'next/server';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

const VENUES=[
 'Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen',
 'Forum Copenhagen','Amager Bio',
 'Pumpehuset','Poolen'
];

const JAMBASE_VENUES=[
 'Royal Arena','KB Hallen','Store VEGA','Lille VEGA','Scandic Falkoner',
 'Forum Copenhagen','DR Koncerthuset','Koncerthuset','Amager Bio',
 'Pumpehuset','Poolen'
];

const venueAliases:Record<string,string[]>={
 'Royal Arena':['royal arena'],
 'K.B. Hallen':['k.b. hallen','kb hallen','k.b hallen'],
 'Store VEGA':['store vega'],
 'Lille VEGA':['lille vega'],
 'Falkonersalen':['falkonersalen','falkoner salen','scandic falkoner'],
 'Forum Copenhagen':['forum copenhagen','forum københavn'],
 'Amager Bio':['amager bio'],
 'Pumpehuset':['pumpehuset'],
 'Poolen':['poolen']
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

const concertGenre=(event:any)=>{
 const performers=Array.isArray(event.performer)?event.performer:Array.isArray(event.performers)?event.performers:[];
 const values=[
  event.genre,
  event.genres,
  ...performers.flatMap((p:any)=>[p?.genre,p?.genres])
 ].flat(Infinity).filter(Boolean).map(String);
 const raw=values.join(' ').toLowerCase();
 if(/metal|hardcore/.test(raw)) return 'Metal';
 if(/hip.?hop|rap/.test(raw)) return 'Hip-hop/Rap';
 if(/r&b|rhythm|soul|funk/.test(raw)) return 'R&B/Soul';
 if(/electro|edm|house|techno|dance|dj/.test(raw)) return 'Electronic';
 if(/jazz|blues/.test(raw)) return 'Jazz/Blues';
 if(/country|folk|americana|singer.?songwriter/.test(raw)) return 'Folk/Country';
 if(/classical|klassisk|orchestra|symph|opera/.test(raw)) return 'Classical';
 if(/rock|punk|alternative|indie/.test(raw)) return 'Rock/Indie';
 if(/pop/.test(raw)) return 'Pop';
 return values[0]||'Andet';
};

const DR_MUSIC=['elektronisk','filmmusik','folk/country','hip hop/rap','indie','jazz','klassisk','kor','pop','rock','soul/r&b','verdensmusik','dr symfoniorkestret','dr big band','dr pigekoret','dr vokalensemblet','dr koncertkoret'];

const decodeHtml=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&aelig;/g,'æ').replace(/&oslash;/g,'ø').replace(/&aring;/g,'å');

async function fetchDR():Promise<Concert[]>{
 try{
  const response=await fetch('https://billet.drkoncerthuset.dk/kalender/',{headers:{'User-Agent':'Koncerter-Kobenhavn/1.0'},next:{revalidate:21600}});
  if(!response.ok) return [];
  const html=await response.text();
  const ldJsonPattern=new RegExp('<script[^>]*type=["\\\']application/ld\\\\+json["\\\'][^>]*>([\\\\s\\\\S]*?)</script>','gi');
  const scripts=[...html.matchAll(ldJsonPattern)];
  const out:Concert[]=[];
  for(const match of scripts){
   try{
    const json=JSON.parse(match[1]);
    const items=Array.isArray(json)?json:[json];
    const walk=(x:any):any[]=>!x?[]:Array.isArray(x)?x.flatMap(walk):[x,...walk(x['@graph'])];
    for(const e of items.flatMap(walk)){
     if(!String(e?.['@type']||'').toLowerCase().includes('event')) continue;
     const loc=String(e?.location?.name||'');
     const address=String(e?.location?.address?.streetAddress||'');
     if(!/(koncertsalen|studie [1-4]|dr koncerthuset)/i.test(loc+' '+address)) continue;
     const blob=decodeHtml([e.name,e.description,e.keywords,e.category].flat().filter(Boolean).join(' ')).toLowerCase();
     if(/standup|stand-up|talkshow|tv-show|rundvisning/.test(blob)&&!DR_MUSIC.some(g=>blob.includes(g))) continue;
     const start=String(e.startDate||''); if(!start) continue;
     const artist=decodeHtml(String(e.name||'')).trim(); if(!artist) continue;
     const status=String(e.eventStatus||'').toLowerCase(); if(status.includes('cancel')) continue;
     out.push({id:'dr-'+String(e.identifier||e.url||start+'-'+artist),artist,date:start.slice(0,10),time:start.includes('T')?start.slice(11,16):undefined,venue:'DR Koncerthuset',room:loc||'DR Koncerthuset',genre:concertGenre(e),status:/soldout|udsolgt/.test(blob)?'Udsolgt':'Billetter',url:String(e.url||'https://billet.drkoncerthuset.dk/kalender/'),image:typeof e.image==='string'?e.image:Array.isArray(e.image)?String(e.image[0]||''):'',source:'DR Koncerthuset'});
    }
   }catch{}
  }
  return out;
 }catch{return []}
}

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
  genre:concertGenre(event),
  status:status.includes('postpon')?'Udskudt':status.includes('resched')?'Flyttet':'Billetter',
  url:ticketUrl(event),
  image:typeof event.image==='string'?event.image:Array.isArray(event.image)?event.image[0]||'':'',
  source:'JamBase'
 };
}

export async function GET(){
 const key=process.env.JAMBASE_API_KEY;
 if(!key) return NextResponse.json({concerts:[],error:'JAMBASE_API_KEY mangler',updatedAt:new Date().toISOString()},{status:500});

 try{
  const allEvents:any[]=[];
  const perPage=100;
  const maxPages=6;

  for(let page=1;page<=maxPages;page++){
   const params=new URLSearchParams({
    venueName:JAMBASE_VENUES.join('|'),
    eventDateFrom:new Date().toISOString().slice(0,10),
    perPage:String(perPage),
    page:String(page)
   });

   const response=await fetch('https://api.data.jambase.com/v3/events?'+params.toString(),{
    headers:{Authorization:'Bearer '+key,Accept:'application/json','User-Agent':'Koncerter-Kobenhavn/1.0'},
    next:{revalidate:21600}
   });
   const data=await response.json();
   if(!response.ok) return NextResponse.json({concerts:[],error:'JamBase request fejlede',details:data,updatedAt:new Date().toISOString()},{status:response.status});

   const events=Array.isArray(data.events)?data.events:[];
   allEvents.push(...events);
   if(events.length<perPage) break;
  }

  const mapped=allEvents.map(toConcert).filter(Boolean) as Concert[];
  const dr=await fetchDR();
  mapped.push(...dr);
  const unique=new Map<string,Concert>();
  for(const concert of mapped){
   const key=[concert.venue,concert.date,concert.time||'',concert.artist.toLowerCase()].join('|');
   if(!unique.has(key)) unique.set(key,concert);
  }
  const concerts=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));

  return NextResponse.json({
   concerts,
   counts:{total:concerts.length,received:allEvents.length,dr:dr.length},
   source:'JamBase',
   attribution:'Powered by JamBase',
   updatedAt:new Date().toISOString()
  });
 }catch(error){
  return NextResponse.json({concerts:[],error:'Kunne ikke hente koncertdata',updatedAt:new Date().toISOString()},{status:500});
 }
}
