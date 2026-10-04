'use client';
import {useEffect,useMemo,useState} from 'react';

type Concert={id:string;artist:string;date:string;time?:string;venue:string;room?:string;genre:string;status:string;url?:string;image?:string};
type ViewMode='grid'|'list'|'calendar';
const venues=['Alle steder','Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen','Forum Copenhagen','DR Koncerthuset','Amager Bio','Pumpehuset','Poolen','Loppen'];
const genres=['Alle','Pop','Rock/Indie','Hip-hop/Rap','R&B/Soul','Electronic','Jazz/Blues','Metal','Folk/Country','Classical','Andet'];
const genreClass=(g:string)=>'g-'+g.toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');
const formatDate=(d:string)=>new Intl.DateTimeFormat('da-DK',{weekday:'short',day:'numeric',month:'short'}).format(new Date(d+'T12:00:00'));

export default function Home(){
 const [concerts,setConcerts]=useState<Concert[]>([]),[q,setQ]=useState(''),[venue,setVenue]=useState('Alle steder'),[genre,setGenre]=useState('Alle'),[view,setView]=useState<ViewMode>('grid'),[showSoldOut,setShowSoldOut]=useState(true),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch('/api/concerts').then(r=>r.json()).then(d=>setConcerts(d.concerts||[])).finally(()=>setLoading(false))},[]);
 const shown=useMemo(()=>concerts.filter(c=>(venue==='Alle steder'||c.venue===venue)&&(genre==='Alle'||c.genre===genre)&&(showSoldOut||c.status!=='Udsolgt')&&(!q||c.artist.toLowerCase().includes(q.toLowerCase())||c.venue.toLowerCase().includes(q.toLowerCase()))),[concerts,q,venue,genre,showSoldOut]);
 return <div className="site">
  <header className="topbar"><div className="identity"><b>KBH<span>LIVE</span></b><em>Koncerter i København</em></div><div className="count">{loading?'Henter…':shown.length+' koncerter'}</div></header>
  <main className="main">
   <div className="controls">
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg artist eller venue…"/>
    <select value={venue} onChange={e=>setVenue(e.target.value)}>{venues.map(v=><option key={v}>{v}</option>)}</select>
    <button className="soldToggle" onClick={()=>setShowSoldOut(v=>!v)}>{showSoldOut?'Skjul udsolgte':'Vis udsolgte'}</button>
    <div className="views">{([['grid','⊞'],['list','≡'],['calendar','▦']] as [ViewMode,string][]).map(([v,i])=><button key={v} className={view===v?'active':''} onClick={()=>setView(v)} title={v}>{i}</button>)}</div>
   </div>
   <div className="genreFilters">{genres.map(g=><button key={g} className={genre===g?'active':''} onClick={()=>setGenre(g)}>{g}</button>)}</div>
   {!loading&&shown.length===0?<div className="empty">Ingen koncerter matcher dine filtre.</div>:view==='grid'?<Grid concerts={shown}/>:view==='list'?<List concerts={shown}/>:<Calendar concerts={shown}/>}
  </main>
  <footer>Powered by JamBase</footer>
 </div>
}
function Genre({name}:{name:string}){return <span className={'genre '+genreClass(name)}>{name}</span>}
function Grid({concerts}:{concerts:Concert[]}){return <div className="concertGrid">{concerts.map(c=><a className="concertCard" key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer"><div className="image">{c.image?<img src={c.image} alt=""/>:<div className="fallback"/>}<Genre name={c.genre}/></div><div className="cardBody"><h2>{c.artist}</h2><p>{c.venue}</p><div className="meta"><div><strong>{formatDate(c.date)}</strong><span>{c.time||''}</span></div><b>{c.status}</b></div></div></a>)}</div>}
function List({concerts}:{concerts:Concert[]}){return <div className="concertList"><div className="listHead"><span>Artist / Venue</span><span>Dato & tid</span><span>Genre</span><span>Billet</span></div>{concerts.map(c=><a className="listRow" key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer"><div><strong>{c.artist}</strong><small>{c.venue}</small></div><div><strong>{formatDate(c.date)}</strong><small>{c.time||''}</small></div><Genre name={c.genre}/><b>{c.status}</b></a>)}</div>}
function Calendar({concerts}:{concerts:Concert[]}){
 const first=concerts[0]?.date||new Date().toISOString().slice(0,10); const init=new Date(first+'T12:00:00');
 const [cursor,setCursor]=useState({y:init.getFullYear(),m:init.getMonth()});
 const firstDay=new Date(cursor.y,cursor.m,1), days=new Date(cursor.y,cursor.m+1,0).getDate(), offset=(firstDay.getDay()+6)%7;
 const cells:Array<number|null>=[...Array(offset).fill(null),...Array.from({length:days},(_,i)=>i+1)]; while(cells.length%7)cells.push(null);
 const byDay=new Map<number,Concert[]>(); concerts.forEach(c=>{const d=new Date(c.date+'T12:00:00');if(d.getFullYear()===cursor.y&&d.getMonth()===cursor.m){const a=byDay.get(d.getDate())||[];a.push(c);byDay.set(d.getDate(),a)}});
 const move=(n:number)=>{const d=new Date(cursor.y,cursor.m+n,1);setCursor({y:d.getFullYear(),m:d.getMonth()})};
 return <div className="calendar"><div className="calNav"><button onClick={()=>move(-1)}>‹</button><h2>{new Intl.DateTimeFormat('da-DK',{month:'long',year:'numeric'}).format(new Date(cursor.y,cursor.m,1))}</h2><button onClick={()=>move(1)}>›</button></div><div className="week">{['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map(x=><b key={x}>{x}</b>)}</div><div className="days">{cells.map((day,i)=><div className="day" key={i}>{day&&<><span>{day}</span>{(byDay.get(day)||[]).slice(0,3).map(c=><a key={c.id} href={c.url||undefined} target={c.url?'_blank':undefined} rel="noreferrer">{c.artist}</a>)}</>}</div>)}</div></div>
}