'use client';
import {useEffect,useMemo,useState} from 'react';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room?:string;genre:string;status:string;url?:string;image?:string;firstSeen?:string|null};
type ViewMode='grid'|'list'|'calendar';
const venues=['Alle steder','Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen','Forum Copenhagen','DR Koncerthuset','Amager Bio','Pumpehuset','Poolen' ];
const genres=['Alle','Pop','Rock/Indie','Hip-hop/Rap','R&B/Soul','Electronic','Jazz/Blues','Metal','Folk/Country','Classical','Andet'];
const genreClass=(g:string)=>'g-'+g.toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');
const formatDate=(d:string)=>new Intl.DateTimeFormat('da-DK',{weekday:'short',day:'numeric',month:'short'}).format(new Date(d+'T12:00:00'));

export default function Home(){
 const [newPeriod,setNewPeriod]=useState<'today'|'week'>('week'),[showAllNew,setShowAllNew]=useState(false);
 const [concerts,setConcerts]=useState<Concert[]>([]),[q,setQ]=useState(''),[venue,setVenue]=useState('Alle steder'),[genre,setGenre]=useState('Alle'),[view,setView]=useState<ViewMode>('grid'),[showSoldOut,setShowSoldOut]=useState(true),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch('/api/concerts').then(r=>r.json()).then(d=>setConcerts(d.concerts||[])).finally(()=>setLoading(false))},[]);
 const shown=useMemo(()=>concerts.filter(c=>(venue==='Alle steder'||c.venue===venue)&&(genre==='Alle'||c.genre===genre)&&(showSoldOut||c.status!=='Udsolgt')&&(!q||c.artist.toLowerCase().includes(q.toLowerCase())||c.venue.toLowerCase().includes(q.toLowerCase()))),[concerts,q,venue,genre,showSoldOut]);
 const newConcerts=useMemo(()=>concerts.filter(c=>{if(!c.firstSeen)return false;const age=Date.now()-new Date(c.firstSeen).getTime();return age>=0&&age<(newPeriod==='today'?86400000:7*86400000)}).sort((a,b)=>String(b.firstSeen).localeCompare(String(a.firstSeen))),[concerts,newPeriod]);
 return <div className="site">
  <header className="topbar"><div className="identity"><b>KBH<span>LIVE</span></b><em>BYENS KONCERTER, SAMLET</em></div><div className="count"><span className="liveDot">●</span> Opdateret løbende <span className="countDivider">{loading?'Henter…':concerts.length+' kommende koncerter'}</span></div></header>
  <main className="main">
   <section id="new-concerts" className="discoveryBanner discoveryEditorial" aria-label="Netop annoncerede koncerter">
    <div className="editorialLeft">
     <span className="editorialEyebrow"><span className="editorialPulse"/> NYT PÅ KBH LIVE</span>
     <h2>Netop<br/>annoncerede<br/>koncerter</h2>
     <p>De nyeste koncerter fra spillestederne i København, samlet ét sted.</p>
     <a className="editorialLink" href="#concert-programme">SE HELE PROGRAMMET <span aria-hidden="true">↘</span></a>
    </div>
    <div className="editorialRight">
     <div className="editorialToolbar">
      <div className="editorialTabs" role="group" aria-label="Vælg periode">
       <button className={newPeriod==='today'?'active':''} onClick={()=>{setNewPeriod('today');setShowAllNew(false)}}>I dag</button>
       <button className={newPeriod==='week'?'active':''} onClick={()=>{setNewPeriod('week');setShowAllNew(false)}}>Denne uge {newPeriod==='week'&&newConcerts.length>0&&<span className="editorialCount">{newConcerts.length}</span>}</button>
      </div>
      <span className="editorialUpdated">Opdateres løbende</span>
     </div>
     <div className="editorialList">
      {loading?<p className="editorialEmpty">Henter nye koncerter…</p>:newConcerts.length===0?<p className="editorialEmpty">Ingen nye koncerter registreret {newPeriod==='today'?'de seneste 24 timer':'de seneste 7 dage'} endnu.</p>:(showAllNew?newConcerts:newConcerts.slice(0,3)).map(c=>{
       const parts=new Date(c.date+'T12:00:00');
       const day=new Intl.DateTimeFormat('da-DK',{day:'numeric'}).format(parts);
       const month=new Intl.DateTimeFormat('da-DK',{month:'short'}).format(parts).replace('.','').toUpperCase();
       return <a className="editorialEvent" key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer">
        <span className="editorialDate"><strong>{day}</strong><small>{month}</small></span>
        <span className="editorialDetails"><small className="editorialGenre">{c.genre}</small><strong>{c.artist}</strong><span className="editorialVenue">● &nbsp; {c.venue.toUpperCase()}{c.time?' · '+c.time:''}</span></span>
        <span className="editorialArrow" aria-hidden="true">↗</span>
       </a>
      })}
     </div>
     {newConcerts.length>3&&<button className="editorialMore" onClick={()=>setShowAllNew(v=>!v)}>{showAllNew?'VIS FÆRRE':'SE ALLE '+newConcerts.length+' NYE KONCERTER'} <span aria-hidden="true">↗</span></button>}
    </div>
   </section>
   <div id="concert-programme" className="listingHeading"><div><span className="sectionKicker">PÅ PLAKATEN</span><h1>Kommende koncerter</h1></div><span>{shown.length} resultater</span></div>
   <div className="controls">
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg artist eller venue…"/>
    <select value={venue} onChange={e=>setVenue(e.target.value)}>{venues.map(v=><option key={v}>{v}</option>)}</select>
    <label className="soldToggle"><input type="checkbox" checked={!showSoldOut} onChange={e=>setShowSoldOut(!e.target.checked)}/> SKJUL UDSOLGTE</label>
    <div className="views">{([['grid','⊞'],['list','≡'],['calendar','▦']] as [ViewMode,string][]).map(([v,i])=><button key={v} className={view===v?'active':''} onClick={()=>setView(v)} title={v}>{i}</button>)}</div>
   </div>
   <div className="genreFilters">{genres.map(g=><button key={g} className={genre===g?'active':''} onClick={()=>setGenre(g)}>{g}</button>)}</div>
   {!loading&&shown.length===0?<div className="empty">Ingen koncerter matcher dine filtre.</div>:view==='grid'?<Grid concerts={shown}/>:view==='list'?<List concerts={shown}/>:<Calendar concerts={shown}/>}
  </main>
  <footer>Powered by JamBase</footer>
 </div>
}
function Genre({name}:{name:string}){return <span className={'genre '+genreClass(name)}>{name}</span>}
function Grid({concerts}:{concerts:Concert[]}){return <div className="concertGrid">{concerts.map(c=><a className="concertCard" key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer"><div className="image">{c.image?<img src={c.image} alt=""/>:<div className="fallback"/>}<Genre name={c.genre}/>{c.status==='Udsolgt'&&<span className="soldBadge">UDSOLGT</span>}</div><div className="cardBody"><h2>{c.artist}</h2><p className="venueHighlight"><span>●</span>{c.venue}</p><div className="meta"><div><strong>{formatDate(c.date)}</strong><span>{c.time||''}</span></div><b className={c.status==='Udsolgt'?'soldStatus':''}>{c.status==='Udsolgt'?'—':'BILLETTER ↗'}</b></div></div></a>)}</div>}
function List({concerts}:{concerts:Concert[]}){return <div className="concertList"><div className="listHead"><span>Artist / Venue</span><span>Dato & tid</span><span>Genre</span><span>Billet</span></div>{concerts.map(c=><a className="listRow" key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer"><div><strong>{c.artist}</strong><small className="venueHighlight"><span>●</span>{c.venue}</small></div><div><strong>{formatDate(c.date)}</strong><small>{c.time||''}</small></div><Genre name={c.genre}/><b>{c.status}</b></a>)}</div>}
function Calendar({concerts}:{concerts:Concert[]}){
 const first=concerts[0]?.date||new Date().toISOString().slice(0,10); const init=new Date(first+'T12:00:00');
 const [cursor,setCursor]=useState({y:init.getFullYear(),m:init.getMonth()});
 const firstDay=new Date(cursor.y,cursor.m,1), days=new Date(cursor.y,cursor.m+1,0).getDate(), offset=(firstDay.getDay()+6)%7;
 const cells:Array<number|null>=[...Array(offset).fill(null),...Array.from({length:days},(_,i)=>i+1)]; while(cells.length%7)cells.push(null);
 const byDay=new Map<number,Concert[]>(); concerts.forEach(c=>{const d=new Date(c.date+'T12:00:00');if(d.getFullYear()===cursor.y&&d.getMonth()===cursor.m){const a=byDay.get(d.getDate())||[];a.push(c);byDay.set(d.getDate(),a)}});
 const move=(n:number)=>{const d=new Date(cursor.y,cursor.m+n,1);setCursor({y:d.getFullYear(),m:d.getMonth()})};
 return <div className="calendar"><div className="calNav"><button onClick={()=>move(-1)}>‹</button><h2>{new Intl.DateTimeFormat('da-DK',{month:'long',year:'numeric'}).format(new Date(cursor.y,cursor.m,1))}</h2><button onClick={()=>move(1)}>›</button></div><div className="week">{['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map(x=><b key={x}>{x}</b>)}</div><div className="days">{cells.map((day,i)=><div className="day" key={i}>{day&&<><span>{day}</span>{(byDay.get(day)||[]).slice(0,3).map(c=><a key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer">{c.artist}</a>)}</>}</div>)}</div></div>
}