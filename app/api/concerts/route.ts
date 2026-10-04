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

async function fetchDR():Promise<{concerts:Concert[];diagnostics:any}>{
 const diagnostics={calendarStatus:0,calendarBytes:0,eventLinks:0,eventPagesFetched:0,dateMatches:0,concerts:0,sampleLinks:[] as string[],iframeLinks:[] as string[],iframeStatus:0,iframeBytes:0,error:''};
 try{
  const response=await fetch('https://billet.drkoncerthuset.dk/kalender/',{headers:{'User-Agent':'Koncerter-Kobenhavn/1.0'},next:{revalidate:21600}});
  diagnostics.calendarStatus=response.status;
  if(!response.ok) return {concerts:[],diagnostics};
  const html=await response.text();
  diagnostics.calendarBytes=html.length;
  const iframePattern=new RegExp("<iframe[^>]+src=[\\\"']([^\\\"']+)[\\\"']","gi");
  const iframeLinks=[...html.matchAll(iframePattern)].map(m=>new URL(m[1],response.url).toString());
  diagnostics.iframeLinks=iframeLinks;
  let calendarHtml=html;
  const ticketFrame=iframeLinks.find(url=>url.includes('billetter.drkoncerthuset.dk'));
  if(ticketFrame){
   const frameResponse=await fetch(ticketFrame,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
   diagnostics.iframeStatus=frameResponse.status;
   if(frameResponse.ok){calendarHtml=await frameResponse.text();diagnostics.iframeBytes=calendarHtml.length;}
  }
  const clean=(v:string)=>decodeHtml(v.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim());
  const hrefPattern=new RegExp("href=[\\\"']([^\\\"']+)[\\\"']","gi");
  const links=[...calendarHtml.matchAll(hrefPattern)];
  const urls=[...new Set(links.map(m=>m[1]).filter(href=>/kalender|event|arrangement|forestilling|koncert/i.test(href)).map(href=>new URL(href,response.url).toString()).filter(url=>url!==response.url))].slice(0,250);
  diagnostics.eventLinks=urls.length;
  diagnostics.sampleLinks=urls.slice(0,3);
  const out:Concert[]=[];
  for(let i=0;i<urls.length;i+=12){
   const batch=urls.slice(i,i+12);
   const pages=await Promise.all(batch.map(async url=>{try{const r=await fetch(url,{headers:{'User-Agent':'Koncerter-Kobenhavn/1.0'},next:{revalidate:21600}});return r.ok?{url,html:await r.text()}:null}catch{return null}}));
   for(const page of pages){
    if(!page) continue;
    diagnostics.eventPagesFetched++;
    const text=clean(page.html);
    const dateMatch=text.match(/(\\d{1,2})\\.\\s+(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\\s+(20\\d{2})\\s+KL\\.\\s*(\\d{1,2})[.:](\\d{2})/i);
    if(!dateMatch) continue;
    diagnostics.dateMatches++;
    const months:Record<string,string>={januar:'01',februar:'02',marts:'03',april:'04',maj:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',december:'12'};
    const date=dateMatch[3]+'-'+months[dateMatch[2].toLowerCase()]+'-'+dateMatch[1].padStart(2,'0');
    if(date<new Date().toISOString().slice(0,10)) continue;
    const h1Pattern=new RegExp("<h1[^>]*>([\\s\\S]*?)</h1>","i");
    const titlePattern=new RegExp("<title[^>]*>([\\\\s\\\\S]*?)</title>","i");
    const titleMatch=page.html.match(h1Pattern)||page.html.match(titlePattern);
    let artist=titleMatch?clean(titleMatch[1]).replace(/\\s*\\|.*$/,'').trim():'';
    if(!artist) continue;
    const room=(text.match(/(Koncertsalen|Studie\\s*[1-4])/i)||[])[1]||'DR Koncerthuset';
    const lower=text.toLowerCase();
    if(/standup|stand-up|talkshow|rundvisning/.test(lower)&&!DR_MUSIC.some(g=>lower.includes(g))) continue;
    const status=/udsolgt/.test(lower)?'Udsolgt':/venteliste/.test(lower)?'Venteliste':'Billetter';
    const imagePattern1=new RegExp("<meta[^>]+property=[\\\"']og:image[\\\"'][^>]+content=[\\\"']([^\\\"']+)","i");
    const imagePattern2=new RegExp("<meta[^>]+content=[\\\"']([^\\\"']+)[\\\"'][^>]+property=[\\\"']og:image[\\\"']","i");
    const imageMatch=page.html.match(imagePattern1)||page.html.match(imagePattern2);
    out.push({id:'dr-'+date+'-'+artist.toLowerCase().replace(/[^a-z0-9]+/g,'-'),artist,date,time:dateMatch[4].padStart(2,'0')+':'+dateMatch[5],venue:'DR Koncerthuset',room,genre:concertGenre({name:artist,description:text}),status,url:page.url,image:imageMatch?decodeHtml(imageMatch[1]):'',source:'DR Koncerthuset'});
   }
  }
  diagnostics.concerts=out.length;
  return {concerts:out,diagnostics};
 }catch(error){diagnostics.error=error instanceof Error?error.message:String(error);return {concerts:[],diagnostics}}
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
  const drResult=await fetchDR();
  const dr=drResult.concerts;
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
   drDiagnostics:drResult.diagnostics,
   source:'JamBase',
   attribution:'Powered by JamBase',
   updatedAt:new Date().toISOString()
  });
 }catch(error){
  return NextResponse.json({concerts:[],error:'Kunne ikke hente koncertdata',updatedAt:new Date().toISOString()},{status:500});
 }
}
