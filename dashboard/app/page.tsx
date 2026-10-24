"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, BarChart3, CalendarDays, CheckCircle2, CircleAlert, Database, Download, FileUp, Leaf, Plus, RefreshCw, Sprout, TrendingUp, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CropId, Observation, PriceType, crops, midpoint, months, priceLabel, referenceObservations } from "../lib/price-data";
import { estimateSeasonalPrice } from "../lib/seasonal-forecast";
import ocrCandidates from "../lib/demo-candidates.json";

type MonthValue = { value: number | null; days: number };
const facebookPage = "https://www.facebook.com/thambuttegamaeconomiccenter";
type OcrCandidate = {date:string;crop:CropId;low:number;high:number;source_url:string;quality:string};
const ocrObservations:Observation[] = (ocrCandidates as OcrCandidate[]).map((r,i)=>({
  id:`demo|${i}|${r.date}|${r.crop}`,date:r.date,crop:r.crop,variety:"Synthetic demo",
  minPrice:r.low,maxPrice:r.high,priceType:"wholesale",sourceKind:"demo",sourceUrl:r.source_url,
}));
const browserStorageKey = "thambuttegama-demo-local-observations-v1";
const yearPalette = ["#b66a43","#8465ae","#c36180","#377caa","#919647","#d69a3f","#277655"];
const yearColor = (year:number) => yearPalette[((year-2020)%yearPalette.length+yearPalette.length)%yearPalette.length];
const dateLabel = (date:string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-LK",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const recordId = (r:Observation) => [r.date,r.crop,r.variety.toLowerCase(),r.priceType].join("|");

function mergeRecords(base:Observation[], added:Observation[]) {
  const map = new Map(base.map(r=>[r.id,r]));
  added.forEach(r=>map.set(r.id,r));
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function averageByMonth(records:Observation[],year:number,month:number):MonthValue {
  const prefix = year + "-" + String(month).padStart(2,"0");
  const days = new Map<string,number[]>();
  records.filter(r=>r.date.startsWith(prefix)).forEach(r=>days.set(r.date,[...(days.get(r.date)||[]),midpoint(r)]));
  const vals = [...days.values()].map(row=>row.reduce((a,b)=>a+b,0)/row.length);
  return {value:vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null,days:vals.length};
}
function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"warn"|"good"}) {
  const style = tone==="good"?"bg-emerald-100 text-emerald-800":tone==="warn"?"bg-amber-100 text-amber-800":"bg-[#edf1e9] text-[#5a705f]";
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + style}>{children}</span>;
}
function Stat({icon,title,value,subtitle}:{icon:React.ReactNode;title:string;value:string;subtitle:string}) {
  return <div className="flex items-center gap-4 rounded-[20px] border border-[#e3e9df] bg-white p-5">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ecf2e7] text-[#4c8964]">{icon}</div>
    <div><p className="text-xs font-semibold text-[#829184]">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="text-[11px] text-[#9ba99c]">{subtitle}</p></div>
  </div>;
}

export default function Home() {
  const [records,setRecords] = useState<Observation[]>(referenceObservations);
  const [sourceMode,setSourceMode] = useState<"ocr"|"verified">("ocr");
  const [dbState,setDbState] = useState<"loading"|"ready"|"offline">("loading");
  const [crop,setCrop] = useState<CropId>("beans");
  const [priceType,setPriceType] = useState<PriceType>("wholesale");
  const [variety,setVariety] = useState("all");
  const [yearBase,setYearBase] = useState(2025);
  const [graphYears,setGraphYears] = useState<number[]>([2024,2025,2026]);
  const [page,setPage] = useState<"overview"|"data">("overview");
  const [showInput,setShowInput] = useState(false);
  const [entryDate,setEntryDate] = useState("");
  const [entrySource,setEntrySource] = useState("");
  const [draft,setDraft] = useState<Record<string,{min:string;max:string}>>({});
  const [imagePreviews,setImagePreviews] = useState<{name:string;url:string}[]>([]);
  const [imageIndex,setImageIndex] = useState(0);
  const [csvText,setCsvText] = useState("");
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  const [targetMonth,setTargetMonth] = useState("2026-12");

  const refresh = useCallback(async()=>{
    try {
      const saved = JSON.parse(window.localStorage.getItem(browserStorageKey) || "[]") as unknown;
      setRecords(mergeRecords(referenceObservations,Array.isArray(saved)?saved as Observation[]:[]));
      setDbState("ready");
    } catch { setDbState("offline"); }
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>()=>{imagePreviews.forEach(image=>URL.revokeObjectURL(image.url));},[imagePreviews]);

  const ocrMode = sourceMode==="ocr";
  const activeRecords = useMemo(()=>ocrMode ? ocrObservations : records,[ocrMode,records]);
  const years = useMemo(()=>Array.from(new Set([2020,2021,2022,2023,2024,2025,2026,...activeRecords.map(r=>Number(r.date.slice(0,4)))]))
    .sort((a,b)=>a-b).filter(y=>y>=2020),[activeRecords]);
  const selectedCrop = crops.find(c=>c.id===crop)!;
  const varieties = useMemo(()=>[...new Set(activeRecords.filter(r=>r.crop===crop).map(r=>r.variety).filter(Boolean))].sort(),[activeRecords,crop]);
  const scoped = useMemo(()=>activeRecords.filter(r=>r.crop===crop && r.priceType===priceType && (variety==="all" || r.variety===variety)),[activeRecords,crop,priceType,variety]);
  const chartData = useMemo(()=>months.map((m,i)=>{
    const old = averageByMonth(scoped,yearBase,i+1), recent = averageByMonth(scoped,yearBase+1,i+1);
    return {month:m,prior:old.value,next:recent.value,priorDays:old.days,nextDays:recent.days};
  }),[scoped,yearBase]);
  const multiYearData = useMemo(()=>months.map((month,i)=>{
    const row:Record<string,string|number|null>={month};
    for(const year of graphYears)row[String(year)]=averageByMonth(scoped,year,i+1).value;
    return row;
  }),[scoped,graphYears]);
  function toggleGraphYear(year:number){
    setGraphYears(selected=>selected.includes(year)
      ? selected.length>1?selected.filter(item=>item!==year):selected
      : [...selected,year].sort((a,b)=>a-b));
  }
  const annualData = useMemo(()=>years.map(year=>{
    const dates=new Map<string,number[]>();
    scoped.filter(r=>r.date.startsWith(String(year)+"-")).forEach(r=>dates.set(r.date,[...(dates.get(r.date)||[]),midpoint(r)]));
    const values=[...dates.values()].map(a=>a.reduce((sum,v)=>sum+v,0)/a.length);
    return {year:String(year),days:values.length,average:values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null};
  }),[years,scoped]);
  const priorCount = new Set(scoped.filter(r=>r.date.startsWith(String(yearBase)+"-")).map(r=>r.date)).size;
  const nextCount = new Set(scoped.filter(r=>r.date.startsWith(String(yearBase+1)+"-")).map(r=>r.date)).size;
  const latest = activeRecords.length?activeRecords.reduce((a,b)=>a.date>b.date?a:b).date:"";
  const uniqueDates = new Set(activeRecords.map(r=>r.date)).size;
  const coveredCrops = new Set(activeRecords.map(r=>r.crop)).size;
  const manualCount = records.filter(r=>r.sourceKind==="manual").length;
  const forecast = useMemo(()=>estimateSeasonalPrice(scoped,targetMonth),[scoped,targetMonth]);

  async function persist(items:Observation[], advanceImage = false) {
    setMessage("");setSaving(true);
    try {
      const old = JSON.parse(window.localStorage.getItem(browserStorageKey) || "[]") as Observation[];
      window.localStorage.setItem(browserStorageKey,JSON.stringify(mergeRecords(old,items)));
      setMessage(String(items.length)+" record(s) saved in this browser.");
      await refresh();setDraft({});setCsvText("");
      if(advanceImage && imageIndex < imagePreviews.length-1) {
        setImageIndex(i=>i+1);
        setEntryDate("");
        setEntrySource("");
        setMessage(String(items.length)+" record(s) saved in this browser. Select the next image date.");
      } else { setShowInput(false); }
    } catch(err) {setMessage(err instanceof Error?err.message:"Save failed");}
    finally {setSaving(false);}
  }
  function saveDaily(){
    if(!entryDate){setMessage("Select the date printed on this price list.");return;}
    const batch:Observation[]=[];
    for(const c of crops){
      const v=draft[c.id];
      if(!v || (!v.min.trim()&&!v.max.trim()))continue;
      const low=Number(v.min),high=Number(v.max);
      if(!v.min||!v.max||!Number.isFinite(low)||!Number.isFinite(high)||low<0||high<low) {
        setMessage("Check the price range for "+c.en);return;
      }
      const row:Observation={id:"",date:entryDate,crop:c.id,variety:"",minPrice:low,maxPrice:high,
        priceType:"wholesale",sourceKind:"manual",sourceUrl:entrySource};
      row.id=recordId(row);batch.push(row);
    }
    if(!batch.length){setMessage("Enter at least one crop price.");return;}
    void persist(batch,true);
  }
  function importCsv(text:string) {
    const lines=text.trim().split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    if(!lines.length){setMessage("Paste CSV rows first.");return;}
    const start=lines[0].toLowerCase().startsWith("date,")?1:0;
    const imported:Observation[]=[];
    for(let i=start;i<lines.length;i++){
      const cells=lines[i].split(",").map(v=>v.trim().replace(/^"|"$/g,""));
      const [date,cropId,min,max,kind,region,url]=cells;
      const validDay = /^20\d{2}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
      const validPrices = min!=="" && max!=="" && Number.isFinite(Number(min)) && Number.isFinite(Number(max)) && Number(min)>0 && Number(max)>=Number(min) && Number(max)<=100000;
      if(!crops.some(c=>c.id===cropId)||!validDay||!validPrices||!(["wholesale","farmgate","retail"].includes(kind||"wholesale"))||(url!==undefined&&url!==""&&!/^https:\/\//i.test(url))){
        setMessage("Check CSV line "+String(i+1)+". Use an English crop ID.");return;
      }
      const row:Observation={id:"",date,crop:cropId as CropId,variety:(region||"").slice(0,100),minPrice:Number(min),maxPrice:Number(max),
        priceType:(kind||"wholesale") as PriceType,sourceKind:region==="Unverified OCR"?"ocr":"manual",sourceUrl:url||""};
      row.id=recordId(row);imported.push(row);
    }
    if(!imported.length){setMessage("No data rows found.");return;}
    if(imported.length>10000){setMessage("Import up to 10,000 rows at once.");return;}
    void persist(imported);
  }
  function exportCsv(){
    const header="date,crop,min,max,price_type,variety,source_url,source_kind";
    const lines=activeRecords.map(r=>[r.date,r.crop,r.minPrice,r.maxPrice,r.priceType,r.variety,r.sourceUrl,r.sourceKind]
      .map(v=>'"'+String(v).replaceAll('"','""')+'"').join(","));
    const url=URL.createObjectURL(new Blob([[header,...lines].join("\n")],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=ocrMode?"synthetic_demo_price_data.csv":"local_browser_price_observations.csv";a.click();URL.revokeObjectURL(url);
  }

  return <div className="min-h-screen bg-[#f6f8f3] font-sans text-[#20352a]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col bg-[#193b2c] px-5 py-7 text-white lg:flex">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#d4e6c2] text-[#1d5035]"><Sprout size={25}/></div>
        <div><p className="text-[10px] uppercase tracking-[.23em] text-[#b7cfb2]">Rajarata Insight</p><h2 className="text-lg font-bold tracking-tight">Govi Analytics</h2></div>
      </div>
      <p className="mt-12 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#87ae99]">Workspace</p>
      <button onClick={()=>setPage("overview")} className={"mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium "+(page==="overview"?"bg-[#386247] text-white":"text-[#b7cfb2] hover:bg-white/10")}><BarChart3 size={18}/> Price dashboard</button>
      <button onClick={()=>setPage("data")} className={"mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium "+(page==="data"?"bg-[#386247] text-white":"text-[#b7cfb2] hover:bg-white/10")}><Database size={18}/> Data & sources</button>
      <button onClick={()=>{setShowInput(true);setPage("data");setMessage("");}} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[#b7cfb2] hover:bg-white/10"><Plus size={18}/> Add price data</button>
        <div className="mt-auto rounded-[18px] border border-[#527259]/40 bg-[#274936] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Leaf size={16}/> Thambuttegama</div>
        <p className="text-xs leading-5 text-[#c4d4c8]">Market-focused crop price analysis for smarter harvest planning.</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-[#d1e1d0]"><span className="h-2 w-2 rounded-full bg-[#9cd09b]"/> Open-source portfolio demo</div>
      </div>
    </aside>
    <main className="min-h-screen lg:ml-[248px]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7dc] bg-white px-5 py-4 sm:px-9">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8efdf] text-[#367148] lg:hidden"><Leaf size={19}/></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#82948b]">Market intelligence</div><h1 className="text-lg font-bold tracking-tight">Thambuttegama Economic Centre</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setPage(page==="overview"?"data":"overview")} className="rounded-xl border border-[#dfe8dd] px-3 py-2 text-xs font-semibold lg:hidden">{page==="overview"?"Data & sources":"Dashboard"}</button>
          <Badge tone={dbState==="ready"?"good":"warn"}>{dbState==="ready"?"Browser storage ready":dbState==="loading"?"Loading local data...":"Browser storage unavailable"}</Badge>
        </div>
      </header>
      <div className="mx-auto max-w-[1450px] px-5 pb-16 pt-7 sm:px-9">
        <section className="mb-6 rounded-[22px] border border-[#dce8d9] bg-white px-5 py-4 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-bold text-[#2a5c3b]">Demonstration data source</p><p className="mt-1 text-xs text-[#7a8c7e]">Synthetic examples and your locally entered observations are always separate.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={"rounded-xl px-4 py-2 text-xs font-bold transition " + (ocrMode?"bg-amber-100 text-amber-900 ring-1 ring-amber-300":"bg-[#f0f4ee] text-[#607564]")} onClick={()=>{setSourceMode("ocr");setVariety("all");setPriceType("wholesale");}}>Synthetic demo ({ocrObservations.length})</button>
              <button className={"rounded-xl px-4 py-2 text-xs font-bold transition " + (!ocrMode?"bg-[#d8eccc] text-[#21513a] ring-1 ring-[#a6c59b]":"bg-[#f0f4ee] text-[#607564]")} onClick={()=>{setSourceMode("verified");setVariety("all");}}>Source examples + local entries ({records.length})</button>
            </div>
          </div>
          {ocrMode ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><CircleAlert size={17} className="mr-1 inline"/><strong>SYNTHETIC DEMO — NOT REAL MARKET PRICES.</strong> Every chart and seasonal estimate in this mode is generated from made-up examples to show the software. Do not use these figures to plan crops, trade, or forecast actual prices. Real Facebook images and private OCR history are excluded from this GitHub release.</div> : <div className="mt-3 rounded-xl bg-[#f1f7ee] px-4 py-3 text-xs text-[#57715f]">Small attributed source examples and local browser entries appear here. Imported OCR rows remain <strong>unverified</strong>. Entries are saved only in this browser (localStorage), never on a server; keep a CSV backup.</div>}
        </section>
        {page==="overview" ? <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_265px]">
            <div className="relative overflow-hidden rounded-[25px] bg-[#234a37] p-7 text-white shadow-[0_15px_40px_rgba(28,65,45,.10)] sm:p-9">
              <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full border-[58px] border-white/5"/>
              <div className="absolute bottom-[-110px] right-12 h-64 w-64 rounded-full border-[32px] border-[#afcf9d]/10"/>
              <div className="relative z-10">
                <div className="mb-4 flex items-center gap-2 text-xs font-medium tracking-[.1em] text-[#c8e0bf]"><Leaf size={15}/> CROP PRICE TRACKER</div>
                <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Understand the market.<br/><span className="text-[#c1dfaa]">Plan your next harvest.</span></h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#c6d7c9]">Explore a synthetic 2020–2026 demonstration of the multi-year graphs and seasonal estimator. Actual market OCR records are not bundled.</p>
                <button onClick={()=>{setPage("data");setShowInput(true);}} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#d7e8c2] px-4 py-2.5 text-sm font-semibold text-[#244b34] hover:bg-white">Add daily prices <ArrowRight size={16}/></button>
              </div>
            </div>
            <div className="rounded-[25px] border border-[#e3e9dd] bg-white p-6">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.12em] text-[#78907d]">Data coverage</span><Activity className="text-[#7a9d6e]" size={18}/></div>
              <p className="mt-5 text-4xl font-bold tracking-tight">{uniqueDates}<span className="ml-2 text-sm font-medium text-[#869388]">observed dates</span></p>
              <p className="mt-2 text-sm text-[#718275]">{activeRecords.length} {ocrMode?"synthetic example rows":"reference/local records"} for {coveredCrops} of {crops.length} selected crops</p>
              <div className="my-5 h-px bg-[#edf0e9]"/>
              <p className="text-xs font-semibold text-[#78907d]">Latest observation</p>
              <p className="mt-2 text-lg font-bold">{latest?dateLabel(latest):"No data yet"}</p>
              <Badge tone="warn">{ocrMode?"Generated examples only":"Historical coverage incomplete"}</Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat icon={<Database size={18}/>} title="2020–2024 covered dates" value={String(new Set(activeRecords.filter(r=>Number(r.date.slice(0,4))<=2024).map(r=>r.date)).size)} subtitle={ocrMode?"Synthetic generated dates":"Reference/local observations"}/>
            <Stat icon={<CalendarDays size={18}/>} title="2025–2026 covered dates" value={String(new Set(activeRecords.filter(r=>Number(r.date.slice(0,4))>=2025).map(r=>r.date)).size)} subtitle={ocrMode?"Synthetic generated dates":"Reference/local observations"}/>
            <Stat icon={<CheckCircle2 size={18}/>} title="Manually added" value={String(manualCount)} subtitle="Saved in this browser only"/>
          </div>
          <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,.8fr)]">
            <section className="rounded-[24px] border border-[#e3e9df] bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><h3 className="text-xl font-bold">Monthly price comparison</h3><p className="mt-1 text-sm text-[#7b8e81]">Select any years to compare their Jan–Dec price trends, LKR/kg</p></div>
                <Badge tone="warn">{ocrMode?"SYNTHETIC DEMO DATA":"Not a full-month market average"}</Badge>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-[#6a7b6e]">Crop<select value={crop} onChange={e=>{setCrop(e.target.value as CropId);setVariety("all");}} className="field mt-2">{crops.map(c=><option value={c.id} key={c.id}>{c.en} · {c.si}</option>)}</select></label>
                <label className="text-xs font-semibold text-[#6a7b6e]">Two-year detail table (below)<select value={yearBase} onChange={e=>setYearBase(Number(e.target.value))} className="field mt-2">{years.filter(y=>y<Math.max(...years)).map(y=><option value={y} key={y}>{y} vs {y+1}</option>)}</select></label>
                <label className="text-xs font-semibold text-[#6a7b6e]">Price type<select value={priceType} onChange={e=>setPriceType(e.target.value as PriceType)} className="field mt-2"><option value="wholesale">Wholesale</option><option value="farmgate">Farmgate</option><option value="retail">Retail</option></select></label>
              </div>
              {varieties.length>1 && <label className="mt-3 block text-xs text-[#718275]">Variety/region<select className="field mt-2" value={variety} onChange={e=>setVariety(e.target.value)}><option value="all">All varieties (mixed)</option>{varieties.map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
              <div className="mt-5 rounded-2xl border border-[#e6ece2] bg-[#f8faf6] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-bold text-[#486b51]">Years shown on graph</p><p className="mt-1 text-[11px] text-[#839187]">Choose one or more years. Each year has its own line.</p></div>
                  <div className="flex items-center gap-2 text-xs font-semibold"><button type="button" onClick={()=>setGraphYears([...years])} className="rounded-lg border border-[#dce5d8] bg-white px-3 py-1.5 text-[#477655] hover:bg-[#eff5eb]">All years</button><button type="button" onClick={()=>setGraphYears(years.slice(-2))} className="rounded-lg border border-[#dce5d8] bg-white px-3 py-1.5 text-[#477655] hover:bg-[#eff5eb]">Latest 2</button></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Select years for monthly graph">
                  {years.map(year=>{const chosen=graphYears.includes(year);return <button key={year} type="button" aria-pressed={chosen} onClick={()=>toggleGraphYear(year)} className={"inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition "+(chosen?"border-[#acc9b0] bg-white text-[#234f34] shadow-sm":"border-[#dfe8dc] bg-[#f2f5ef] text-[#87988a] hover:bg-white")}><span className="h-2.5 w-2.5 rounded-full" style={{background:chosen?yearColor(year):"#cbd5ca"}}/>{year}{chosen?<span aria-hidden="true">✓</span>:null}</button>;})}
                </div>
              </div>
              <div className="mt-7 h-[305px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={multiYearData} margin={{top:10,right:15,bottom:0,left:-14}}>
                    <CartesianGrid stroke="#edf1ea" strokeDasharray="4 5" vertical={false}/>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:"#7f9183",fontSize:12}}/>
                    <YAxis axisLine={false} tickLine={false} tick={{fill:"#7f9183",fontSize:12}} domain={[0,"auto"]}/>
                    <Tooltip contentStyle={{borderRadius:12,border:"1px solid #e0e9df",fontSize:12}} formatter={(v,name)=>v==null?["No record",name]:[priceLabel(Number(v)),name]}/>
                    <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                    {graphYears.map(year=><Line key={year} type="linear" dataKey={String(year)} name={String(year)} stroke={yearColor(year)} strokeWidth={2.6} dot={{r:2.5,strokeWidth:1.5}} activeDot={{r:5}} connectNulls={false} isAnimationActive={false}/>)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 rounded-xl bg-[#f3f7ef] px-4 py-3 text-xs leading-5 text-[#6b806d]"><CircleAlert className="mr-1 inline" size={14}/> Blank months mean no observations, not zero prices. Range midpoints are used for plotting; they are not market-wide averages.{ocrMode?" All values shown here are intentionally invented for this demo.":""}</div>
            </section>
            <section className="rounded-[24px] border border-[#e3e9df] bg-white p-5 sm:p-7">
              <div className="flex items-center justify-between"><h3 className="text-xl font-bold">Harvest price outlook</h3><TrendingUp size={21} className="text-[#6d9d75]"/></div>
              <p className="mt-2 text-sm leading-6 text-[#819081]">An experimental seasonal calculation based on same-calendar-month sample data. Synthetic demo estimates do not predict real prices.</p>
              <div className="mt-7 rounded-2xl bg-[#f3f6ef] p-4">
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#7e9480]">Selected crop</p>
                <div className="mt-2 flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{background:selectedCrop.color}}/><p className="font-semibold">{selectedCrop.si} · {selectedCrop.en}</p></div>
              </div>
              <label className="mt-5 block text-xs font-semibold text-[#6d826e]">Expected harvest month<select value={targetMonth} onChange={e=>setTargetMonth(e.target.value)} className="field mt-2">{Array.from({length:24},(_,i)=>{const date=new Date(Date.UTC(2026,10+i,1));const key=date.toISOString().slice(0,7);return <option key={key} value={key}>{date.toLocaleDateString("en-LK",{month:"long",year:"numeric",timeZone:"UTC"})}</option>;})}</select></label>
              <div className="mt-7 border-t border-[#e9eee6] pt-6">
                {forecast ? <>
                  <Badge tone="warn">{ocrMode?"SYNTHETIC EXAMPLE · NOT A FORECAST":"Experimental · source/local examples"}</Badge>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[.08em] text-[#7f9281]">Estimated monthly price (Rs/kg)</p>
                  <p className="mt-2 text-3xl font-bold">{priceLabel(forecast.price)}<span className="text-sm font-normal"> / kg</span></p>
                  <p className="mt-2 text-sm font-semibold text-[#5e7863]">Illustrative range: {priceLabel(forecast.low)} – {priceLabel(forecast.high)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#718574]"><div className="rounded-lg bg-white px-3 py-2"><strong className="block text-base text-[#31543b]">{forecast.years}</strong>matching years</div><div className="rounded-lg bg-white px-3 py-2"><strong className="block text-base text-[#31543b]">{forecast.days}</strong>sampled dates</div></div>
                  {forecast.limited && <p className="mt-3 text-xs font-semibold text-amber-800">Limited matching-month history. Treat this estimate with extra caution.</p>}
                  <p className="mt-4 text-xs leading-5 text-[#7c8d7f]">Years used: {forecast.basisYears.join(", ")}. Recent years and well-sampled dates carry more weight. The range widens with price variability and forecast horizon; it is not a statistical confidence interval.</p>
                  <p className="mt-3 text-xs leading-5 text-amber-800">{ocrMode?"This number is derived entirely from fictional values and must never guide planting. ":""}Economic-centre wholesale observations are not guaranteed farm-gate revenue.</p>
                </> :
                  <><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><CircleAlert size={22}/></div><h4 className="font-bold">Not enough matching-month data</h4><p className="mt-2 text-sm leading-6 text-[#829285]">This crop has fewer than eight sampled dates in sufficiently covered past instances of the selected month. Try a different harvest month or add more price records.</p></>}
              </div>
            </section>
          </div>
          <section className="mt-6 rounded-[24px] border border-[#e3e9df] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Seven-year price history</h3><p className="mt-1 text-sm text-[#7b8e81]">{selectedCrop.en}: average midpoint across sampled dates in each year, Rs/kg</p></div><Badge tone="warn">{ocrMode?"Synthetic demonstration":"Source/local examples"}</Badge></div>
            <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
              <div className="h-[250px] min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={annualData} margin={{top:12,right:15,bottom:0,left:-9}}><CartesianGrid stroke="#edf1ea" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill:"#7f9183",fontSize:12}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#7f9183",fontSize:12}} domain={[0,"auto"]}/><Tooltip contentStyle={{borderRadius:12,border:"1px solid #e0e9df",fontSize:12}} formatter={(value)=>value==null?["No record","Sampled-day mean"]:[priceLabel(Number(value)),"Sampled-day mean"]}/><Bar dataKey="average" name="Sampled-day mean" fill="#4a8a64" radius={[5,5,0,0]} maxBarSize={52}/></BarChart></ResponsiveContainer></div>
              <div className="overflow-hidden rounded-xl border border-[#e8eee5]"><table className="w-full text-sm"><thead className="bg-[#f3f7ef] text-xs text-[#788c7b]"><tr><th className="px-4 py-3 text-left">Year</th><th className="text-right">Rs/kg</th><th className="pr-4 text-right">Dates</th></tr></thead><tbody>{annualData.map(a=><tr key={a.year} className="border-t border-[#edf1ea]"><td className="px-4 py-2 font-semibold">{a.year}</td><td className="text-right">{a.average==null?"—":priceLabel(a.average)}</td><td className="pr-4 text-right text-[#728675]">{a.days}</td></tr>)}</tbody></table></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#889889]">Years have different numbers and seasonal distributions of sampled dates. The chart describes only recorded days, not a full-year market average. {ocrMode?"Synthetic values are illustrative, not real historical prices.":""}</p>
          </section>
          <section className="mt-6 rounded-[24px] border border-[#e3e9df] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">Month-by-month evidence</h3><p className="mt-1 text-sm text-[#7b8e81]">{selectedCrop.en}: daily observations available in each year</p></div><span className="text-xs text-[#7f9183]">{priorCount} days in {yearBase} · {nextCount} days in {yearBase+1}</span></div>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[590px] text-left text-sm"><thead><tr className="border-b border-[#e9eee6] text-xs uppercase tracking-wider text-[#839486]"><th className="py-3">Month</th><th>{yearBase} observed avg.</th><th>Days</th><th>{yearBase+1} observed avg.</th><th>Days</th><th>YoY change</th></tr></thead><tbody>{chartData.map(r=><tr key={r.month} className="border-b border-[#f0f3ec] last:border-0"><td className="py-3.5 font-semibold">{r.month}</td><td>{r.prior==null?"—":priceLabel(r.prior)}</td><td>{r.priorDays}</td><td>{r.next==null?"—":priceLabel(r.next)}</td><td>{r.nextDays}</td><td>{r.priorDays>=5&&r.nextDays>=5&&r.prior?((Number(r.next)/r.prior-1)*100).toFixed(1)+"%":<span className="text-[#a1aaa0]">Insufficient data</span>}</td></tr>)}</tbody></table></div>
            <p className="mt-4 text-xs text-[#8a988b]">Year-over-year comparisons require five covered dates in the same month in both years. {ocrMode?"These generated patterns are solely for demonstration.":"This minimum screen is not proof of representativeness."}</p>
          </section>
        </> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">Data collection & sources</h2><p className="mt-2 text-sm text-[#7c8d80]">Inspect synthetic examples, follow the original data source, and enter your own observations.</p></div><button onClick={exportCsv} className="secondary-btn"><Download size={16}/> Export {ocrMode?"synthetic demo":"local records"} CSV</button></div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
            <section className="rounded-[24px] border border-[#e3e9df] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">Price records</h3><button className="primary-btn" onClick={()=>{setShowInput(true);setMessage("");}}><Plus size={16}/> Add records</button></div>
              <p className="mt-2 text-sm text-[#7a8c7f]">{activeRecords.length} {ocrMode?"synthetic examples":"observations"} · {uniqueDates} unique dates.</p>
              <div className="mt-5 max-h-[620px] overflow-auto rounded-xl border border-[#edf1e9]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-[#f5f8f2] text-xs text-[#718576]"><tr><th className="p-3">Date</th><th>Crop / variety</th><th>Range (Rs/kg)</th><th>Source</th></tr></thead><tbody>{[...activeRecords].reverse().map(r=><tr key={r.id} className="border-t border-[#edf0e8]"><td className="p-3 whitespace-nowrap">{dateLabel(r.date)}</td><td><span className="font-semibold">{crops.find(c=>c.id===r.crop)?.en}</span><span className="block text-xs text-[#889687]">{r.variety||"Unspecified"}</span></td><td className="whitespace-nowrap">{priceLabel(r.minPrice)}–{priceLabel(r.maxPrice).replace("Rs. ","")}</td><td>{r.sourceUrl?<a className="text-xs font-semibold text-[#287451] hover:underline" href={r.sourceUrl} target="_blank" rel="noreferrer">{r.sourceKind} ↗</a>:<span className="text-xs text-[#8b9b8d]">{r.sourceKind}</span>}</td></tr>)}</tbody></table></div>
            </section>
            <div className="space-y-5">
              <section className="rounded-[24px] border border-[#e3e9df] bg-white p-6"><div className="flex items-center gap-2 text-[#47875e]"><Database size={18}/><h3 className="font-bold text-[#203b29]">Reference sources</h3></div><a className="mt-4 block text-sm font-semibold text-[#287451] hover:underline" href={facebookPage} target="_blank" rel="noreferrer">Facebook · Thambuttegama DEC ↗</a><p className="mt-1 text-xs leading-5 text-[#7f8f80]">This page is the research project's source, but the public demo charts are generated, not scraped from it. The OCR scripts support importing your own permitted archives.</p><a className="mt-4 block text-sm font-semibold text-[#287451] hover:underline" href="https://app.thambuttegamadec.lk/public/" target="_blank" rel="noreferrer">Dedicated Centre price page ↗</a><p className="mt-1 text-xs leading-5 text-[#7f8f80]">The source/local mode includes a small collection of individually attributed reference examples.</p></section>
              <section className="rounded-[24px] border border-[#e3e9df] bg-white p-6"><div className="flex items-center gap-2 text-[#47875e]"><RefreshCw size={18}/><h3 className="font-bold text-[#203b29]">Local data workflow</h3></div><ol className="mt-4 space-y-3 text-sm leading-6 text-[#718474]"><li>1. Get permission to use source photos and run OCR locally if needed.</li><li>2. Select “Add records” to enter values or import up to 10,000 CSV rows.</li><li>3. Switch to “Source examples + local entries” to explore your records; export a CSV backup.</li></ol><div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Nothing is automatically synced with Facebook or uploaded to a server. Local browser storage can be cleared by your browser.</div></section>
            </div>
          </div>
        </>}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e0e8dc] pt-5 text-xs text-[#87988a]"><p>Public demo data is fictional. Validate real wholesale and farm-gate prices before planting.</p><button className="flex items-center gap-2 font-semibold hover:text-[#2c7952]" onClick={refresh}><RefreshCw size={14}/> Reload browser data</button></footer>
      </div>
    </main>
    {showInput && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102b20]/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Add price records">
      <div className="max-h-[94vh] w-full max-w-[850px] overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#67916f]">Data entry</p><h2 className="mt-1 text-2xl font-bold">Add daily market prices</h2><p className="mt-2 text-sm text-[#7c8d7e]">Enter wholesale low–high ranges (Rs/kg) from a dated price image.</p></div><button className="rounded-xl p-2 hover:bg-[#f0f4ed]" onClick={()=>{setShowInput(false);setMessage("");}} aria-label="Close"><X size={21}/></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[#6d826d]">List date<input type="date" className="field mt-2" min="2020-01-01" max={new Date(Date.now()+86400000).toISOString().slice(0,10)} value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label><label className="text-xs font-semibold text-[#6d826d]">Facebook post/source URL<input type="url" className="field mt-2" placeholder="https://www.facebook.com/..." value={entrySource} onChange={e=>setEntrySource(e.target.value)}/></label></div>
        <div className="mt-5 rounded-xl border border-dashed border-[#c8d6c8] bg-[#f9fbf7] p-4">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#457652]"><FileUp size={21}/> Select Facebook price-list images (multiple allowed)<input type="file" accept="image/*" multiple className="sr-only" onChange={e=>{
            const selected=Array.from(e.target.files||[]).map(file=>({name:file.name,url:URL.createObjectURL(file)}));
            if(selected.length){setImagePreviews(selected);setImageIndex(0);setEntryDate("");setEntrySource("");setDraft({});}
          }}/></label>
          <p className="mt-2 text-xs leading-5 text-[#829383]">Images stay in this browser. Read the list and enter its prices below; automatic image text extraction is not active.</p>
          {imagePreviews.length>0 && <div className="mt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#647e67]">
              <span className="max-w-[65%] truncate font-semibold">{imagePreviews[imageIndex]?.name} · {imageIndex+1} of {imagePreviews.length}</span>
              <div className="flex gap-2"><button type="button" className="secondary-btn" disabled={imageIndex===0} onClick={()=>setImageIndex(v=>Math.max(0,v-1))}>Previous</button><button type="button" className="secondary-btn" disabled={imageIndex===imagePreviews.length-1} onClick={()=>setImageIndex(v=>Math.min(imagePreviews.length-1,v+1))}>Next</button></div>
            </div>
            <img src={imagePreviews[imageIndex]?.url} alt={"Facebook price list "+String(imageIndex+1)} className="max-h-[430px] w-full rounded-xl object-contain"/>
          </div>}
        </div>
        <div className="mt-5 grid gap-x-5 gap-y-3 sm:grid-cols-2">{crops.map(c=><div key={c.id} className="rounded-xl border border-[#e8eee5] p-3"><div className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{background:c.color}}/>{c.en}<span className="text-xs font-normal text-[#839484]">{c.si}</span></div><div className="grid grid-cols-2 gap-2"><input className="field" type="number" min="0" placeholder="Low Rs/kg" value={draft[c.id]?.min||""} onChange={e=>setDraft(d=>({...d,[c.id]:{min:e.target.value,max:d[c.id]?.max||""}}))}/><input className="field" type="number" min="0" placeholder="High Rs/kg" value={draft[c.id]?.max||""} onChange={e=>setDraft(d=>({...d,[c.id]:{min:d[c.id]?.min||"",max:e.target.value}}))}/></div></div>)}</div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#8a9789]">New entries are marked “manual” until verified.</p><button className="primary-btn" disabled={saving||dbState!=="ready"} onClick={saveDaily}>{saving?"Saving...":"Save daily prices"}<ArrowRight size={16}/></button></div>
        <details className="mt-6 rounded-xl border border-[#e7ede3] p-4"><summary className="cursor-pointer text-sm font-semibold">Bulk CSV import (up to 10,000 rows)</summary><p className="mt-3 text-xs leading-5 text-[#879488]">Columns: date,crop,min,max,price_type,variety,source_url. Crop IDs: {crops.map(c=>c.id).join(", ")}.</p><label className="mt-4 block text-xs font-semibold text-[#5a805f]">Select a local CSV file<input className="field mt-2" type="file" accept=".csv,text/csv" disabled={saving||dbState!=="ready"} onChange={async e=>{const file=e.target.files?.[0];if(file)importCsv(await file.text());e.target.value="";}}/></label><p className="mt-3 text-xs text-[#8c998e]">Or paste CSV below:</p><textarea className="field mt-2 min-h-28 font-mono text-xs" value={csvText} onChange={e=>setCsvText(e.target.value)} placeholder={"date,crop,min,max,price_type,variety,source_url\n2026-10-23,tomato,100,150,wholesale,,https://..."}/><button className="secondary-btn mt-3" disabled={saving||dbState!=="ready"} onClick={()=>importCsv(csvText)}><FileUp size={15}/> Import pasted CSV</button></details>
        {!!message && <p className="mt-4 rounded-xl bg-[#f0f4e9] px-4 py-3 text-sm text-[#476f51]">{message}</p>}
        {dbState!=="ready" && <p className="mt-3 text-sm text-amber-700">Browser storage is unavailable. Enable it to save local entries.</p>}
      </div>
    </div>}
  </div>;
}
