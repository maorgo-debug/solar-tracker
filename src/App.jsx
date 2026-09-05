import { useState, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, AreaChart, Area, CartesianGrid } from "recharts";

const LOAN_AMOUNT   = 79800;
const LOAN_MONTHLY  = 1500;
const TARIFF_BUY    = 0.635;
const TARIFF_SELL   = 0.48;
const MONTHLY_BILL  = 1000;
const MONTHLY_SOLAR_INCOME = 1652;
const DAILY_CONS    = 52;
const SYSTEM_KWP    = 22.4;
const INSTALL_DATE  = "2026-08-13";
const TESCO_ANNUAL  = 17741;
const TESCO_PAYBACK = 4.5;
const SUNRISE = 6, SUNSET = 19.5;
const STORAGE_KEY  = "solar_v9_log";
const INTRADAY_KEY = "solar_v9_intra";

function calcValue(kwh) {
  const self = Math.min(kwh, DAILY_CONS);
  const exp  = Math.max(0, kwh - DAILY_CONS);
  return self * TARIFF_BUY + exp * TARIFF_SELL;
}

function loadLog()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)  || "[]"); } catch { return []; } }
function saveLog(l)   { try { localStorage.setItem(STORAGE_KEY,  JSON.stringify(l)); } catch {} }
function loadIntra()  { try { return JSON.parse(localStorage.getItem(INTRADAY_KEY) || "{}"); } catch { return {}; } }
function saveIntra(d) { try { localStorage.setItem(INTRADAY_KEY, JSON.stringify(d)); } catch {} }

const MO = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
const fmt = (n, d=0) => (n == null || isNaN(n) || !isFinite(n)) ? "—" : n.toLocaleString("he-IL",{maximumFractionDigits:d});
const dlabel = d => { const t=new Date(d); return `${t.getDate()} ${MO[t.getMonth()]}`; };
const tlabel = h => { const hh=Math.floor(h),mm=Math.round((h-hh)*60); return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; };
const nowH   = () => { const n=new Date(); return n.getHours()+n.getMinutes()/60; };
const sfrac  = h => { if(h<=SUNRISE||h>=SUNSET) return 0; return (1-Math.cos((h-SUNRISE)/(SUNSET-SUNRISE)*Math.PI))/2; };
const project = readings => {
  if (!readings?.length) return null;
  const last = [...readings].sort((a,b)=>a.hour-b.hour)[readings.length-1];
  const f = sfrac(last.hour);
  return f<=0 ? null : last.kwh/f;
};

const dayColor = kwh => kwh>=100?"#00FFB3":kwh>=85?"#10D98A":kwh>=70?"#F59E0B":kwh>=50?"#F97316":"#EF4444";
const dayEmoji = kwh => kwh>=100?"😎":kwh>=85?"✅":kwh>=70?"🟡":"🔴";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const kwh = payload.find(p=>p.dataKey==="kwh");
  return (
    <div style={{background:"#1C2437",border:"1px solid #2A3A58",borderRadius:10,padding:"10px 14px",fontSize:12,direction:"rtl"}}>
      <div style={{color:"#8A9BBF",marginBottom:4}}>{label}</div>
      {kwh && <><div style={{color:dayColor(kwh.value),fontWeight:700}}>{dayEmoji(kwh.value)} {fmt(kwh.value,1)} kWh</div><div style={{color:"#F59E0B",fontWeight:600}}>{fmt(calcValue(kwh.value),1)} ₪</div></>}
    </div>
  );
};

export default function App() {
  const today = new Date().toISOString().split("T")[0];
  const [log, setLog] = useState(() => {
    const ex = loadLog();
    if (ex.length) return ex;
    const seed = [
      {date:"2026-08-13",kwh:113},
      {date:"2026-08-14",kwh:115},
      {date:"2026-08-15",kwh:120},
      {date:"2026-08-16",kwh:119},
      {date:"2026-08-17",kwh:112},
      {date:"2026-08-18",kwh:115},
      {date:"2026-08-19",kwh:120},
      {date:"2026-08-20",kwh:114},
      {date:"2026-08-21",kwh:114},
      {date:"2026-08-22",kwh:114},
      {date:"2026-08-23",kwh:114},
      {date:"2026-08-24",kwh:114},
      {date:"2026-08-25",kwh:114},
      {date:"2026-08-26",kwh:114},
      {date:"2026-08-27",kwh:114},
      {date:"2026-08-28",kwh:114},
      {date:"2026-08-29",kwh:114},
      {date:"2026-08-30",kwh:114},
      {date:"2026-08-31",kwh:114},
      {date:"2026-09-01",kwh:114},
      {date:"2026-09-02",kwh:114},
      {date:"2026-09-03",kwh:114},
      {date:"2026-09-04",kwh:114},
    ];
    saveLog(seed); return seed;
  });
  const [intra,setIntra]=useState(()=>loadIntra());
  const [view,setView]=useState("today");
  const [busy,setBusy]=useState(false);
  const [flash,setFlash]=useState(null);
  const [manual,setManual]=useState("");
  const [thumb,setThumb]=useState(null);
  const [loanBalance,setLoanBalance]=useState(()=>{try{return parseFloat(localStorage.getItem("solar_loan_balance"))||null;}catch{return null;}});
  const [loanInput,setLoanInput]=useState("");
  const [chartMode,setChartMode]=useState("kwh");
  const fileRef=useRef();

  const todayR=intra[today]||[];
  const lastR=todayR.length?[...todayR].sort((a,b)=>b.hour-a.hour)[0]:null;
  const proj=project(todayR);
  const dispKwh=log.find(e=>e.date===today)?.kwh??lastR?.kwh??null;

  function addReading(hour,kwh,date=today){
    setIntra(prev=>{const upd={...prev,[date]:[...(prev[date]||[]).filter(r=>Math.abs(r.hour-hour)>0.2),{hour,kwh}]};saveIntra(upd);return upd;});
    setLog(prev=>{const upd=[...prev.filter(e=>e.date!==date),{date,kwh}].sort((a,b)=>a.date.localeCompare(b.date));saveLog(upd);return upd;});
  }

  async function analyzeImage(file){
    setBusy(true);
    const reader=new FileReader();
    reader.onload=async e=>{
      const b64=e.target.result.split(",")[1];
      setThumb(e.target.result);
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:300,messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},
            {type:"text",text:`Extract solar production data from SolarEdge screenshot. Return ONLY JSON:
{"kwh":<today kWh, convert Wh to kWh>,"time_hour":<decimal hour from status bar>,"date":"<YYYY-MM-DD>"}
Mobile: read status bar clock. Web: read date from header. Convert Wh to kWh (386 Wh = 0.386 kWh).`}
          ]}]})
        });
        if(!res.ok){const err=await res.json().catch(()=>({}));setFlash(`שגיאת API ${res.status}: ${err?.error?.message||"בדוק חיבור"}`);setBusy(false);return;}
        const data=await res.json();
        if(data.error){setFlash(`שגיאה: ${data.error.message}`);setBusy(false);return;}
        const txt=data.content?.[0]?.text?.replace(/```json|```/g,"").trim()||"{}";
        let p={};
        try{p=JSON.parse(txt);}catch{setFlash(`שגיאת פענוח: ${txt.slice(0,50)}`);setBusy(false);return;}
        if(p.kwh){
          const h=p.time_hour||nowH();const d=p.date||today;
          addReading(h,p.kwh,d);
          const pr=project([...(intra[d]||[]),{hour:h,kwh:p.kwh}]);
          setFlash(`✓ ${fmt(p.kwh,1)} kWh · ${tlabel(h)}${pr?` · צפי: ~${fmt(pr,0)} kWh`:""}`);}
        else{setFlash(`לא זיהיתי: ${txt.slice(0,60)}`);}
      }catch(err){setFlash(`שגיאה: ${err.message||"בדוק חיבור"}`);}
      setTimeout(()=>setFlash(null),5000);setBusy(false);
    };
    reader.readAsDataURL(file);
  }

  function addManual(){const v=parseFloat(manual);if(!isNaN(v)&&v>0){addReading(nowH(),v,today);setManual("");const pr=project([...todayR,{hour:nowH(),kwh:v}]);setFlash(`✓ ${fmt(v,1)} kWh${pr?` · צפי: ~${fmt(pr,0)} kWh`:""}`);setTimeout(()=>setFlash(null),5000);}}
  function updateLoanBalance(){const v=parseFloat(loanInput);if(!isNaN(v)&&v>=0){setLoanBalance(v);try{localStorage.setItem("solar_loan_balance",v);}catch{}setLoanInput("");}}

  const pastDays=log.filter(e=>e.date!==today);
  const totalKwh=log.reduce((s,e)=>s+(e.kwh||0),0);
  const avgKwh=pastDays.length?pastDays.reduce((s,e)=>s+(e.kwh||0),0)/pastDays.length:0;
  const totalVal=log.reduce((s,e)=>s+calcValue(e.kwh||0),0);
  const loanPct=Math.min(100,(totalVal/LOAN_AMOUNT)*100);
  const monthlyInc=calcValue(avgKwh)*30;
  const annualInc=calcValue(avgKwh)*365;
  const payback=annualInc>0?LOAN_AMOUNT/annualInc:null;
  const coverage=Math.min(100,(monthlyInc/LOAN_MONTHLY)*100);
  const actualCoverage=Math.min(100,(MONTHLY_SOLAR_INCOME/LOAN_MONTHLY)*100);
  const actualPayback=MONTHLY_SOLAR_INCOME>0?LOAN_AMOUNT/(MONTHLY_SOLAR_INCOME*12):null;
  const projPayback=annualInc>0?LOAN_AMOUNT/annualInc:null;
  const last7=log.slice(-7);
  const wTotal=last7.reduce((s,e)=>s+(e.kwh||0),0);
  const wValue=last7.reduce((s,e)=>s+calcValue(e.kwh||0),0);
  const barData=last7.map(e=>({label:dlabel(e.date),kwh:e.kwh,val:Math.round(calcValue(e.kwh))}));
  const readPts=[...todayR].sort((a,b)=>a.hour-b.hour).map(r=>({label:tlabel(r.hour),kwh:r.kwh}));

  const TAB=(v,l)=>(<button onClick={()=>setView(v)} style={{flex:1,padding:"9px 0",fontSize:13,fontWeight:600,cursor:"pointer",background:view===v?"#0A2A1E":"#111827",border:`1px solid ${view===v?"#10D98A":"#243048"}`,color:view===v?"#10D98A":"#6B7FA3",borderRadius:10}}>{l}</button>);
  const CARD=({label,val,unit,sub,accent,color})=>(<div style={{flex:1,background:accent?"#0A2A1E":"#111827",borderRadius:12,padding:"13px 10px",border:`1px solid ${accent?"#10D98A":"#243048"}`}}><div style={{color:"#6B7FA3",fontSize:10,marginBottom:4}}>{label}</div><div style={{color:color||(accent?"#10D98A":"#fff"),fontSize:19,fontWeight:700,lineHeight:1}}>{val}</div><div style={{color:"#5A6E8C",fontSize:10,marginTop:3}}>{unit}{sub?` · ${sub}`:""}</div></div>);

  return (
    <div style={{minHeight:"100vh",background:"#0B1120",color:"#fff",fontFamily:"SF Pro Display,-apple-system,sans-serif",direction:"rtl",padding:"16px 14px 32px",maxWidth:430,margin:"0 auto"}}>

      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,color:"#10D98A",letterSpacing:1.5,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:"#10D98A",display:"inline-block",boxShadow:"0 0 8px #10D98A"}}/>
          {SYSTEM_KWP} kWp · 35 פאנלים · טסקו אנרגיה
        </div>
        <div style={{fontSize:22,fontWeight:700,letterSpacing:-0.5}}>מאור גורין ☀️</div>
        <div style={{color:"#4A5E7A",fontSize:11,marginTop:2}}>מאז {dlabel(INSTALL_DATE)} · {log.length} ימי נתונים · ממוצע {fmt(avgKwh,1)} kWh/יום</div>
      </div>

      <div style={{background:"linear-gradient(135deg,#0A2A1E,#0B1A2E)",borderRadius:16,padding:16,marginBottom:16,border:"1px solid #10D98A"}}>
        <div style={{color:"#10D98A",fontSize:10,letterSpacing:1.5,marginBottom:12}}>סיכום מצטבר · {pastDays.length} ימים מלאים</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          {[{label:"ממוצע יומי",val:`${fmt(avgKwh,1)} kWh`,sub:`${fmt(calcValue(avgKwh),1)} ₪/יום`},{label:"סה״כ ייצור",val:`${fmt(totalKwh,0)} kWh`,sub:`${fmt(totalVal,0)} ₪`},{label:"הכנסה חודשית",val:`${fmt(MONTHLY_SOLAR_INCOME,0)} ₪`,sub:"בפועל"}].map((k,i)=>(
            <div key={i} style={{background:"#0D1A2E",borderRadius:10,padding:"10px 8px",border:"1px solid #1a3a1a"}}>
              <div style={{color:"#6B7FA3",fontSize:9,marginBottom:4}}>{k.label}</div>
              <div style={{color:"#10D98A",fontSize:14,fontWeight:700,lineHeight:1}}>{k.val}</div>
              <div style={{color:"#4A5E7A",fontSize:9,marginTop:3}}>{k.sub}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{label:"שנתי צפוי",val:`${fmt(annualInc,0)} ₪`,color:"#10D98A"},{label:"החזר הלוואה",val:payback?`${payback.toFixed(1)} שנים`:"—",color:payback&&payback<=4.5?"#10D98A":"#F59E0B"}].map((k,i)=>(
            <div key={i} style={{background:"#0D1A2E",borderRadius:10,padding:"10px 8px",border:"1px solid #1a3a1a",textAlign:"center"}}>
              <div style={{color:"#6B7FA3",fontSize:9,marginBottom:4}}>{k.label}</div>
              <div style={{color:k.color,fontSize:16,fontWeight:700}}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div onClick={()=>fileRef.current.click()} style={{background:busy?"#0A2018":"#111827",border:`1.5px dashed ${busy?"#10D98A":"#243048"}`,borderRadius:14,padding:"13px 16px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&analyzeImage(e.target.files[0])}/>
        <div style={{fontSize:20}}>{busy?"⚡":"📲"}</div>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:busy?"#10D98A":"#E8EFF8"}}>{busy?"מנתח...":"העלה סקרינשוט"}</div><div style={{fontSize:10,color:"#5A6E8C"}}>mySolarEdge → Day view</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {thumb&&<img src={thumb} alt="" style={{width:44,height:44,objectFit:"cover",borderRadius:8,border:"1px solid #2A3A58"}}/>}
          {dispKwh&&<div style={{textAlign:"left"}}><div style={{color:dayColor(dispKwh),fontSize:20,fontWeight:700}}>{fmt(dispKwh,1)}</div><div style={{color:"#6B7FA3",fontSize:10}}>kWh</div></div>}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:flash?8:16}}>
        <input value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addManual()} placeholder="הכנס kWh ידנית" style={{flex:1,background:"#111827",border:"1px solid #243048",borderRadius:10,color:"#fff",padding:"9px 13px",fontSize:13,outline:"none"}}/>
        <button onClick={addManual} style={{background:"#0A2A1E",border:"1px solid #10D98A",color:"#10D98A",borderRadius:10,padding:"9px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>+</button>
      </div>

      {flash&&<div style={{background:"#0A2A1E",border:"1px solid #10D98A",borderRadius:10,padding:"10px 13px",marginBottom:14,fontSize:12,color:"#10D98A",lineHeight:1.5}}>{flash}</div>}

      {todayR.length>0&&(
        <div style={{background:"#111827",borderRadius:14,padding:14,marginBottom:14,border:"1px solid #243048"}}>
          <div style={{color:"#5A6E8C",fontSize:10,marginBottom:10}}>היום · {todayR.length} קריאות</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <CARD label="עכשיו" val={fmt(lastR?.kwh,1)} unit="kWh" sub={lastR?tlabel(lastR.hour):""}/>
            <CARD label="צפי סיום" val={proj?fmt(proj,0):"—"} unit="kWh" accent/>
            <CARD label="שווי יום" val={proj?fmt(calcValue(proj),1):"—"} unit="₪"/>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:proj?12:0}}>
            {[...todayR].sort((a,b)=>a.hour-b.hour).map((r,i)=>(<div key={i} style={{background:"#1C2437",borderRadius:8,padding:"5px 9px",border:"1px solid #2A3A58"}}><div style={{color:"#6B7FA3",fontSize:9}}>{tlabel(r.hour)}</div><div style={{color:dayColor(r.kwh),fontSize:12,fontWeight:700}}>{fmt(r.kwh,1)}</div></div>))}
          </div>
          {proj&&(<div><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#5A6E8C",fontSize:10}}>התקדמות יום</span><span style={{color:"#10D98A",fontSize:10,fontWeight:600}}>{fmt((lastR?.kwh/proj)*100,0)}%</span></div><div style={{background:"#1C2437",borderRadius:5,height:5}}><div style={{width:`${Math.min(100,(lastR?.kwh/proj)*100)}%`,background:`linear-gradient(90deg,#0A3D2A,${dayColor(proj)})`,height:"100%",borderRadius:5}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:3}}><span style={{color:"#4A5E7A",fontSize:9}}>{fmt(lastR?.kwh,1)} kWh</span><span style={{color:"#4A5E7A",fontSize:9}}>צפי: {fmt(proj,0)} kWh</span></div></div>)}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:14}}>{TAB("today","היום")}{TAB("week","שבוע")}{TAB("roi","ROI")}</div>

      {view==="today"&&readPts.length>1&&(
        <div style={{background:"#111827",borderRadius:14,padding:"16px 10px 10px",border:"1px solid #243048",marginBottom:14}}>
          <div style={{color:"#6B7FA3",fontSize:10,marginBottom:12,paddingRight:4}}>קריאות היום · kWh מצטבר</div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={readPts}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10D98A" stopOpacity={0.25}/><stop offset="95%" stopColor="#10D98A" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"#6B7FA3",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#4A5E7A",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>} cursor={{stroke:"#10D98A",strokeWidth:1}}/>
              {proj&&<ReferenceLine y={proj} stroke="#F59E0B" strokeDasharray="3 3" strokeWidth={1} label={{value:`צפי ${fmt(proj,0)}`,fill:"#F59E0B",fontSize:9,position:"right"}}/>}
              <Area type="monotone" dataKey="kwh" name="ייצור" stroke="#10D98A" strokeWidth={2} fill="url(#g1)" dot={{fill:"#10D98A",r:4,strokeWidth:0}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {view==="week"&&barData.length>0&&(
        <>
        <div style={{background:"#111827",borderRadius:14,padding:"16px 10px 10px",border:"1px solid #243048",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12,paddingRight:4}}>
            <span style={{color:"#6B7FA3",fontSize:10}}>7 ימים אחרונים</span>
            <span style={{color:"#10D98A",fontSize:10,fontWeight:600}}>{fmt(wTotal,0)} kWh · {fmt(wValue,0)} ₪</span>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10,paddingRight:4}}>
            {[["kwh","⚡ kWh"],["val","💰 ₪"]].map(([k,l])=>(<button key={k} onClick={()=>setChartMode(k)} style={{padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:8,background:chartMode===k?"#0A2A1E":"#1C2437",border:`1px solid ${chartMode===k?"#10D98A":"#2A3A58"}`,color:chartMode===k?"#10D98A":"#6B7FA3"}}>{l}</button>))}
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={barData} barSize={26}>
              <XAxis dataKey="label" tick={{fill:"#5A6E8C",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#4A5E7A",fontSize:9}} axisLine={false} tickLine={false} domain={chartMode==="kwh"?[0,130]:[0,Math.max(...barData.map(d=>d.val))*1.3]} tickFormatter={v=>chartMode==="kwh"?v:`${v}₪`}/>
              <Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;const d=barData.find(b=>b.label===label);return<div style={{background:"#1C2437",border:"1px solid #2A3A58",borderRadius:10,padding:"8px 12px",fontSize:11,direction:"rtl"}}><div style={{color:"#6B7FA3",marginBottom:4}}>{label}</div><div style={{color:dayColor(d?.kwh||0),fontWeight:700}}>{dayEmoji(d?.kwh||0)} {fmt(d?.kwh,1)} kWh</div><div style={{color:"#F59E0B",fontWeight:600}}>{fmt(d?.val,0)} ₪</div></div>;}} cursor={{fill:"#ffffff04"}}/>
              {chartMode==="kwh"&&<ReferenceLine y={100} stroke="#00FFB3" strokeDasharray="3 3" strokeWidth={1} label={{value:"😎 100",fill:"#00FFB3",fontSize:9,position:"right"}}/>}
              {chartMode==="kwh"&&<ReferenceLine y={85} stroke="#F59E0B" strokeDasharray="3 3" strokeWidth={1} label={{value:"יעד",fill:"#F59E0B",fontSize:9,position:"right"}}/>}
              <Bar dataKey={chartMode} name={chartMode==="kwh"?"kWh":"₪"} radius={[5,5,0,0]} label={{position:"insideTop",formatter:(v)=>chartMode==="kwh"?`${fmt(v,0)}`:`${fmt(v,0)}₪`,fontSize:10,fill:"#000",fontWeight:900,dy:8}}>
                {barData.map((e,i)=><Cell key={i} fill={chartMode==="kwh"?dayColor(e.kwh):"#F59E0B"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:8,paddingRight:4,marginTop:8,flexWrap:"wrap"}}>
            {[["#00FFB3","😎 100+"],["#10D98A","✅ 85-100"],["#F59E0B","🟡 70-85"],["#EF4444","🔴 <70"]].map(([c,l])=>(<div key={l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:7,height:7,background:c,borderRadius:2}}/><span style={{color:"#5A6E8C",fontSize:9}}>{l}</span></div>))}
          </div>
        </div>
        <div style={{background:"#111827",borderRadius:14,padding:14,border:"1px solid #243048",marginBottom:14}}>
          <div style={{color:"#5A6E8C",fontSize:10,marginBottom:12}}>סיכום כספי · לפי הסכם טסקו</div>
          <div style={{color:"#4A5E7A",fontSize:9,marginBottom:12}}>צריכה עצמית: {TARIFF_BUY} ₪/kWh · עודף: {TARIFF_SELL} ₪/kWh</div>
          {[{label:"שבועי",kwh:fmt(wTotal,0),val:fmt(wValue,0)},{label:"חודשי (צפי)",kwh:fmt(avgKwh*30,0),val:fmt(monthlyInc,0)},{label:"שנתי (צפי)",kwh:fmt(avgKwh*365,0),val:fmt(annualInc,0)}].map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:i<2?10:0,marginBottom:i<2?10:0,borderBottom:i<2?"1px solid #1C2437":"none"}}>
              <div><div style={{color:"#B0C0D8",fontSize:13}}>{r.label}</div><div style={{color:"#5A6E8C",fontSize:10}}>{r.kwh} kWh</div></div>
              <div><span style={{color:"#10D98A",fontSize:20,fontWeight:700}}>{r.val}</span><span style={{color:"#5A6E8C",fontSize:11,marginRight:3}}>₪</span></div>
            </div>
          ))}
        </div>
        </>
      )}

      {view==="roi"&&(
        <>
        <div style={{background:"#111827",borderRadius:14,padding:"16px 10px 10px",border:"1px solid #243048",marginBottom:10}}>
          <div style={{color:"#6B7FA3",fontSize:10,marginBottom:2,paddingRight:4}}>הלוואה מול הכנסת סולרי · 5 שנים</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={Array.from({length:61},(_,m)=>({label:m===0?"0":m===6?"6":m===12?"12":m===18?"18":m===24?"24":m===30?"30":m===36?"36":m===42?"42":m===48?"48":m===54?"54":m===60?"60":"",month:m,loan:Math.max(0,Math.round(LOAN_MONTHLY*60-m*LOAN_MONTHLY)),solar:Math.round(MONTHLY_SOLAR_INCOME*m),projected:Math.round(monthlyInc*m)}))}>
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10D98A" stopOpacity={0.2}/><stop offset="95%" stopColor="#10D98A" stopOpacity={0}/></linearGradient>
                <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#EF4444" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"#B0C0D8",fontSize:10,fontWeight:600}} axisLine={{stroke:"#2A3A58"}} tickLine={false} interval={0} label={{value:"חודשים",position:"insideBottom",fill:"#5A6E8C",fontSize:9,dy:8}}/>
              <YAxis tick={{fill:"#4A5E7A",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
              <Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:"#1C2437",border:"1px solid #2A3A58",borderRadius:10,padding:"8px 12px",fontSize:11,direction:"rtl"}}><div style={{color:"#6B7FA3",marginBottom:4}}>חודש {payload[0]?.payload?.month}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,fontWeight:600}}>{p.name}: {fmt(p.value,0)} ₪</div>)}</div>;}} cursor={{stroke:"#4A5E7A",strokeWidth:1}}/>
              <Area type="monotone" dataKey="solar" name="בפועל" stroke="#10D98A" strokeWidth={2} fill="url(#sg)" dot={false}/>
              <Area type="monotone" dataKey="projected" name="צפי" stroke="#60A5FA" strokeWidth={1.5} fill="none" strokeDasharray="4 4" dot={false}/>
              <Area type="monotone" dataKey="loan" name="יתרת הלוואה" stroke="#EF4444" strokeWidth={2} fill="url(#lg)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:14,paddingRight:4,marginTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:14,height:2,background:"#10D98A"}}/><span style={{color:"#5A6E8C",fontSize:9}}>בפועל</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:14,height:2,background:"#60A5FA"}}/><span style={{color:"#5A6E8C",fontSize:9}}>צפי</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:14,height:2,background:"#EF4444"}}/><span style={{color:"#5A6E8C",fontSize:9}}>יתרת הלוואה</span></div>
          </div>
        </div>
        <div style={{background:"#111827",borderRadius:14,padding:14,border:"1px solid #243048",marginBottom:14}}>
          <div style={{color:"#5A6E8C",fontSize:10,marginBottom:14}}>תחזית · ממוצע {fmt(avgKwh,1)} kWh/יום · {pastDays.length} ימים</div>
          {[
            {label:"הכנסה בפועל",val:fmt(MONTHLY_SOLAR_INCOME,0),unit:"₪/חודש",sub:`${fmt(MONTHLY_SOLAR_INCOME/30,1)} ₪/יום`,color:"#10D98A"},
            {label:"החזר הלוואה",val:fmt(LOAN_MONTHLY,0),unit:"₪/חודש",sub:"5 שנים · פריים-0.1%"},
            {label:"כיסוי הלוואה (בפועל)",val:fmt(actualCoverage,1),unit:"%",highlight:true,color:actualCoverage>=100?"#10D98A":"#F59E0B"},
            {label:"הכנסה שנתית (צפי)",val:fmt(annualInc,0),unit:"₪/שנה",color:annualInc>=TESCO_ANNUAL?"#10D98A":"#F59E0B"},
            {label:"תחזית טסקו",val:fmt(TESCO_ANNUAL,0),unit:"₪/שנה",sub:"בסיס חוזה"},
            {label:"פער מתחזית",val:(annualInc>=TESCO_ANNUAL?"+":"")+fmt(annualInc-TESCO_ANNUAL,0),unit:"₪/שנה",color:annualInc>=TESCO_ANNUAL?"#10D98A":"#EF4444"},
            {label:"סה״כ 25 שנה",val:fmt(annualInc*25,0),unit:"₪",highlight:true},
            {label:"החזר השקעה (בפועל)",val:actualPayback?actualPayback.toFixed(1):"—",unit:"שנים",sub:"לפי 1,652 ₪/חודש",color:"#10D98A"},
            {label:"החזר השקעה (צפי)",val:projPayback?projPayback.toFixed(1):"—",unit:"שנים",sub:`טסקו: ${TESCO_PAYBACK} שנים`},
          ].map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:r.highlight?"10px 10px":"0 0 9px",marginBottom:9,background:r.highlight?"#0A2A1E":"transparent",borderBottom:!r.highlight?"1px solid #1C2437":"none",borderRadius:r.highlight?10:0}}>
              <div><div style={{color:r.highlight?(r.color||"#10D98A"):"#8A9BBF",fontSize:12,fontWeight:r.highlight?600:400}}>{r.label}</div>{r.sub&&<div style={{color:"#5A6E8C",fontSize:9,marginTop:1}}>{r.sub}</div>}</div>
              <div><span style={{color:r.color||(r.highlight?"#10D98A":"#fff"),fontSize:r.highlight?20:17,fontWeight:700}}>{r.val}</span><span style={{color:"#5A6E8C",fontSize:10,marginRight:3}}>{r.unit}</span></div>
            </div>
          ))}
        </div>
        </>
      )}

      <div style={{background:"#111827",borderRadius:14,padding:14,border:"1px solid #243048",marginBottom:10}}>
        <div style={{color:"#8A9BBF",fontSize:11,marginBottom:10}}>יתרת הלוואה בפועל — מהבנק</div>
        <div style={{display:"flex",gap:8,marginBottom:loanBalance?10:0}}>
          <input value={loanInput} onChange={e=>setLoanInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&updateLoanBalance()} placeholder="הכנס יתרה מהבנק ₪" style={{flex:1,background:"#1C2437",border:"1px solid #2A3A58",borderRadius:10,color:"#fff",padding:"9px 13px",fontSize:13,outline:"none",direction:"rtl"}}/>
          <button onClick={updateLoanBalance} style={{background:"#1C2A1C",border:"1px solid #F59E0B",color:"#F59E0B",borderRadius:10,padding:"9px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>עדכן</button>
        </div>
        {loanBalance!==null&&(<div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#8A9BBF",fontSize:12}}>נשאר לשלם</span><span style={{color:"#F59E0B",fontSize:18,fontWeight:700}}>{fmt(loanBalance,0)} ₪</span></div>
          <div style={{background:"#1C2437",borderRadius:5,height:7,overflow:"hidden",marginBottom:6}}><div style={{width:`${Math.min(100,((LOAN_AMOUNT-loanBalance)/LOAN_AMOUNT)*100)}%`,background:"linear-gradient(90deg,#0A3D2A,#10D98A)",height:"100%",borderRadius:5}}/></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#4A5E7A",fontSize:10}}>שולם: {fmt(LOAN_AMOUNT-loanBalance,0)} ₪</span><span style={{color:"#4A5E7A",fontSize:10}}>{fmt(((LOAN_AMOUNT-loanBalance)/LOAN_AMOUNT)*100,1)}%</span></div>
          {loanBalance>0&&MONTHLY_SOLAR_INCOME>0&&(<div style={{marginTop:8,padding:"8px 10px",background:"#0A2A1E",borderRadius:8,border:"1px solid #1a3a1a"}}><span style={{color:"#10D98A",fontSize:11}}>⚡ עוד ~{fmt(loanBalance/MONTHLY_SOLAR_INCOME,1)} חודשים לסיום ההלוואה</span></div>)}
        </div>)}
      </div>

      <div style={{background:"#111827",borderRadius:14,padding:14,border:"1px solid #243048"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{color:"#8A9BBF",fontSize:12}}>החזר הלוואה · 79,800 ₪</span><span style={{color:"#F59E0B",fontSize:12,fontWeight:600}}>{fmt(loanPct,3)}%</span></div>
        <div style={{background:"#1C2437",borderRadius:5,height:7,overflow:"hidden",marginBottom:6}}><div style={{width:`${loanPct}%`,background:"linear-gradient(90deg,#0A3D2A,#10D98A)",height:"100%",borderRadius:5}}/></div>
        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#4A5E7A",fontSize:10}}>נצבר: {fmt(totalVal,0)} ₪</span><span style={{color:"#4A5E7A",fontSize:10}}>נותר: {fmt(Math.max(0,LOAN_AMOUNT-totalVal),0)} ₪</span></div>
      </div>

      <div style={{textAlign:"center",color:"#1C2437",fontSize:9,marginTop:14}}>טסקו אנרגיה · {TARIFF_BUY} ₪ קנייה · {TARIFF_SELL} ₪ מכירה · {SYSTEM_KWP} kWp</div>
    </div>
  );
}
