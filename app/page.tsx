'use client';
import {useEffect,useMemo,useState} from 'react';
type Concert={id:string;artist:string;date:string;time?:string;venue:string;room?:string;genre:string;status:string;url?:string;image?:string};
const venues=['Alle','Royal Arena','K.B. Hallen','Store VEGA','Lille VEGA','Falkonersalen','Forum Copenhagen','DR Koncerthuset','Amager Bio','Pumpehuset','Poolen','Loppen'];
const genres=['Alle genrer','Pop','Rock/Indie','Hip-hop/Rap','R&B/Soul','Electronic','Jazz/Blues','Metal','Folk/Country','Classical','Andet'];
const matchesVenue=(c:Concert,s:string)=>s==='Alle'||c.venue===s;
export default function Home(){
 const [concerts,setConcerts]=useState<Concert[]>([]),[q,setQ]=useState(''),[venue,setVenue]=useState('Alle'),[genre,setGenre]=useState('Alle genrer'),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch('/api/concerts').then(r=>r.json()).then(d=>setConcerts(d.concerts||[])).finally(()=>setLoading(false))},[]);
 const shown=useMemo(()=>concerts.filter(c=>matchesVenue(c,venue)&&(genre==='Alle genrer'||c.genre===genre)&&c.artist.toLowerCase().includes(q.toLowerCase())),[concerts,q,venue,genre]);
 return <main>
<header><div className="brand">KONCERTER <span>KØBENHAVN</span></div><div className="heart">♡</div></header>
<section className="hero"><p className="eyebrow">LIVE · KØBENHAVN</p><h1>Find din næste<br/><i>koncert.</i></h1><p className="intro">Rigtige kommende koncerter fra Københavns spillesteder — samlet ét sted.</p><div className="search"><span>⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg efter artist..."/></div></section>
<section className="content"><div className="filters">{venues.map(v=><button key={v} className={venue===v?'active':''} onClick={()=>setVenue(v)}>{v}</button>)}</div><div className="filters genreFilters">{genres.map(g=><button key={g} className={genre===g?'active':''} onClick={()=>setGenre(g)}>{g}</button>)}</div><div className="heading"><h2>Kommende koncerter</h2><span>{loading?'Henter koncerter…':shown.length+' koncerter'}</span></div><div className="grid">{shown.map((c,i)=><article className="card" key={c.id}><div className={'poster p'+(i%4)} style={c.image?{backgroundImage:`linear-gradient(rgba(0,0,0,.15),rgba(0,0,0,.35)),url("${c.image}")`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}><span className="genre">{c.genre}</span><div className="posterText">{c.artist}</div></div><div className="info"><div><p className="date">{new Intl.DateTimeFormat('da-DK',{weekday:'short',day:'numeric',month:'short'}).format(new Date(c.date+'T12:00:00'))}</p><h3>{c.artist}</h3><p className="venue">{c.venue}</p></div>{c.url?<a className={'status '+(c.status==='Udsolgt'?'sold':'')} href={c.url} target="_blank" rel="noreferrer">{c.status}</a>:<span className="status">{c.status}</span>}</div></article>)}</div>{!loading&&shown.length===0&&<p>Ingen koncerter fundet for dette spillested endnu.</p>}</section>
<footer>{venues.filter(v=>v!=='Alle').map((v,i)=><span key={v}>{i>0?' · ':''}{v}</span>)}</footer>
</main>
}