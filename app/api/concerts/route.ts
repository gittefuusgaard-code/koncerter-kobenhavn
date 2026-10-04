import {NextResponse} from 'next/server';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room:string;genre:string;status:string;url:string;image:string;source:string};

const VENUES=[
 'Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen',
 'Forum Copenhagen','DR Koncerthuset','Koncerthuset','Amager Bio',
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

const MONTHS:Record<string,string>={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAJ:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OKT:'10',NOV:'11',DEC:'12'};

async function fetchLoppen():Promise<Concert[]>{
 const response=await fetch('https://loppen.dk/kalender',{headers:{'User-Agent':'Koncerter-Kobenhavn/1.0'},next:{revalidate:21600}});
 if(!response.ok) return [];
 const html=await response.text();
 const text=html.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\\s+/g,' ').trim();
 const re=/(MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG|LØRDAG|SØNDAG)\\s+(\\d{1,2})\\.\\s+(JAN|FEB|MAR|APR|MAJ|JUN|JUL|AUG|SEP|OKT|NOV|DEC)\\s+(20\\d{2})\\s+-\\s+KL\\s+(\\d{1,2})[.:](\\d{2})\\s+(.*?)(?=(?:MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG|LØRDAG|SØNDAG)\\s+\\d{1,2}\\.|$)/gi;
 const out:Concert[]=[]; let m:RegExpExecArray|null;
 while((m=re.exec(text))){
  const [, ,day,mon,year,hour,min,chunk]=m;
  const date=year+'-'+MONTHS[mon.toUpperCase()]+'-'+day.padStart(2,'0');
  if(date<new Date().toISOString().slice(0,10)) continue;
  const sold=/UDSOLGT/i.test(chunk);
  let artist=chunk.replace(/^(?:KØB FORSALG:.*?KR|ENTRÉ:.*?KR|GRATIS|UDSOLGT|VENTELISTE)\\s*/i,'').trim();
  artist=artist.replace(/^(?:KØB FORSALG:.*?KR|ENTRÉ:.*?KR|GRATIS|UDSOLGT|VENTELISTE)\\s*/i,'').trim();
  if(!artist) continue;
  out.push({id:'loppen-'+date+'-'+artist.toLowerCase().replace(/[^a-z0-9]+/g,'-'),artist,date,time:hour.padStart(2,'0')+':'+min,venue:'Loppen',room:'Loppen',genre:'Andet',status:sold?'Udsolgt':'Billetter',url:'https://loppen.dk/kalender',image:'',source:'Loppen'});
 }
 return out;
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
  const loppen=await fetchLoppen();
  mapped.push(...loppen);
  const unique=new Map<string,Concert>();
  for(const concert of mapped){
   const key=[concert.venue,concert.date,concert.time||'',concert.artist.toLowerCase()].join('|');
   if(!unique.has(key)) unique.set(key,concert);
  }
  const concerts=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));

  return NextResponse.json({
   concerts,
   counts:{total:concerts.length,received:allEvents.length,loppen:loppen.length},
   source:'JamBase',
   attribution:'Powered by JamBase',
   updatedAt:new Date().toISOString()
  });
 }catch(error){
  return NextResponse.json({concerts:[],error:'Kunne ikke hente koncertdata',updatedAt:new Date().toISOString()},{status:500});
 }
}
