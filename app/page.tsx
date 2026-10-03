'use client';
import {useMemo,useState} from 'react';

type Concert={id:number;artist:string;date:string;venue:string;room?:string;genre:string;status:string};

const concerts:Concert[]=[
{id:1,artist:'The National',date:'2026-10-16',venue:'Royal Arena',genre:'Indie',status:'Billetter'},
{id:2,artist:'Cat Power',date:'2026-10-21',venue:'VEGA',room:'Store VEGA',genre:'Indie',status:'Få billetter'},
{id:3,artist:'Joe Bonamassa',date:'2026-10-27',venue:'K.B. Hallen',genre:'Rock',status:'Billetter'},
{id:4,artist:'MØ',date:'2026-11-06',venue:'VEGA',room:'Store VEGA',genre:'Pop',status:'Billetter'},
{id:5,artist:'Kneecap',date:'2026-11-12',venue:'K.B. Hallen',genre:'Hip-hop',status:'Udsolgt'},
{id:6,artist:'London Grammar',date:'2026-11-19',venue:'Falkonersalen',genre:'Pop',status:'Billetter'},
{id:7,artist:'Fred again..',date:'2026-12-04',venue:'Royal Arena',genre:'Electronic',status:'Få billetter'},
{id:8,artist:'Efterklang',date:'2026-12-11',venue:'VEGA',room:'Lille VEGA',genre:'Indie',status:'Billetter'},
];

const venues=[
'Alle',
'Royal Arena',
'K.B. Hallen',
'Store VEGA',
'Lille VEGA',
'Falkonersalen',
'Forum Copenhagen',
'DR Koncerthuset',
'Amager Bio',
'Pumpehuset',
'Poolen',
'Loppen'
];

const matchesVenue=(c:Concert,selected:string)=>{
 if(selected==='Alle') return true;
 if(selected==='Store VEGA'||selected==='Lille VEGA') return c.room===selected;
 return c.venue===selected;
};

export default function Home(){
 const [q,setQ]=useState('');
 const [venue,setVenue]=useState('Alle');
 const shown=useMemo(()=>concerts.filter(c=>matchesVenue(c,venue)&&c.artist.toLowerCase().includes(q.toLowerCase())),[q,venue]);
 return <main>
<header><div className="brand">KONCERTER <span>KØBENHAVN</span></div><div className="heart">♡</div></header>
<section className="hero"><p className="eyebrow">LIVE · KØBENHAVN</p><h1>Find din næste<br/><i>koncert.</i></h1><p className="intro">Kommende koncerter fra Københavns bedste spillesteder — samlet ét sted.</p><div className="search"><span>⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg efter artist..."/></div></section>
<section className="content"><div className="filters">{venues.map(v=><button key={v} className={venue===v?'active':''} onClick={()=>setVenue(v)}>{v}</button>)}</div><div className="heading"><h2>Kommende koncerter</h2><span>{shown.length} koncerter</span></div><div className="grid">{shown.map((c,i)=><article className="card" key={c.id}><div className={'poster p'+(i%4)}><span className="genre">{c.genre}</span><div className="posterText">{c.artist}</div></div><div className="info"><div><p className="date">{new Intl.DateTimeFormat('da-DK',{weekday:'short',day:'numeric',month:'short'}).format(new Date(c.date))}</p><h3>{c.artist}</h3><p className="venue">{c.room||c.venue} · {c.venue==='VEGA'&&c.room?'VEGA':'København'}</p></div><span className={'status '+(c.status==='Udsolgt'?'sold':'')}>{c.status}</span></div></article>)}</div></section>
<footer>{venues.filter(v=>v!=='Alle').map((v,i)=><span key={v}>{i>0?' · ':''}{v}</span>)}</footer>
</main>
}