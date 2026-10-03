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


const monthMap:Record<string,string>={januar:'01',februar:'02',marts:'03',april:'04',maj:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',december:'12'};

function parseRoyalArena(html:string):Concert[]{
 const text=decode(html);
 const out:Concert[]=[];
 const re=/(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(\d{4})([\s\S]*?)(?=(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+\d{4}|Få koncertnyheder|$)/gi;
 for(const m of text.matchAll(re)){
  const month=monthMap[m[1].toLowerCase()],year=m[2],section=m[3];
  const eventRe=/(?:man|tir|ons|tor|fre|lør|søn)\s+(\d{1,2})\s+\w+\s+(\d{1,2}\.\d{2})\s+(.+?)(?=(?:man|tir|ons|tor|fre|lør|søn)\s+\d{1,2}\s+\w+\s+\d{1,2}\.\d{2}|$)/gi;
  for(const e of section.matchAll(eventRe)){
   const day=e[1].padStart(2,'0'),body=e[3].trim();
   const title=body.split(/Køb billetter|Mere Info|Billetterne er udsolgt/i)[0].trim();
   if(!title||/harlem globetrotters/i.test(title)) continue;
   const date=`${year}-${month}-${day}`;
   if(date<new Date().toISOString().slice(0,10)) continue;
   out.push({id:'royal-'+date+'-'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),artist:title,date,venue:'Royal Arena',room:'Royal Arena',genre:'Musik',status:/udsolgt/i.test(body)?'Udsolgt':'Billetter',url:'https://www.royalarena.dk/shows',image:'',source:'Royal Arena'});
  }
 }
 return out;
}
async function getRoyalArena(){
 const r=await fetch('https://www.royalarena.dk/shows',{headers:{'User-Agent':'Mozilla/5.0'},next:{revalidate:1800}});
 if(!r.ok)return[]; return parseRoyalArena(await r.text());
}

async function getVega(){
 const r=await fetch('https://vega.dk/',{headers:{'User-Agent':'Mozilla/5.0'},next:{revalidate:1800}});
 if(!r.ok)return[]; return parseVega(await r.text());
}
export async function GET(){
 const [vega,royal]=await Promise.all([getVega(),getRoyalArena()]);
 const concerts=[...vega,...royal].sort((a,b)=>a.date.localeCompare(b.date));
 return NextResponse.json({concerts,counts:{vega:vega.length,royalArena:royal.length,total:concerts.length},diagnostics:{vegaWorking:vega.length>0,royalArenaWorking:royal.length>0},updatedAt:new Date().toISOString()});
}