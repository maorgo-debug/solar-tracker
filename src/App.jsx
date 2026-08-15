import { useState, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, AreaChart, Area } from "recharts";

const LOAN_AMOUNT = 80000;
const LOAN_MONTHLY = 1500;
const LOAN_MONTHS = 60;
const TARIFF = 0.635;
const DAILY_CONSUMPTION = 46;
const SYSTEM_KWP = 22.4;
const INSTALL_DATE = "2026-07-07";
const STORAGE_KEY = "solar_daily_log_v4";
const INTRADAY_KEY = "solar_intraday_v4";
const SUNRISE = 6;
const SUNSET = 19.5;

// חישוב שווי יומי לפי מונה חוזר
function calcDayValue(kwh) {
  const selfUse = Math.min(kwh, DAILY_CONSUMPTION); // צריכה עצמית
  const export_ = Math.max(0, kwh - DAILY_CONSUMPTION); // עודף לרשת
  return (selfUse + export_) * TARIFF; // הכל בתעריף רגיל במונה חוזר
}

function loadLog() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveLog(log) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)); } catch {} }
function loadIntraday() { try { return JSON.parse(localStorage.getItem(INTRADAY_KEY) || "{}"); } catch { return {}; } }
function saveIntraday(data) { try { localStorage.setItem(INTRADAY_KEY, JSON.stringify(data)); } catch {} }

const MONTH_HE = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
function fmt(n, dec = 0) {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return n.toLocaleString("he-IL", { maximumFractionDigits: dec });
}
function dateLabel(d) { const dt = new Date(d); return `${dt.getDate()} ${MONTH_HE[dt.getMonth()]}`; }
function timeLabel(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}
function nowHour() { const n = new Date(); return n.getHours() + n.getMinutes() / 60; }

function solarFraction(h) {
  if (h <= SUNRISE || h >= SUNSET) return 0;
  const x = (h - SUNRISE) / (SUNSET - SUNRISE) * Math.PI;
  return (1 - Math.cos(x)) / 2;
}

function projectEndOfDay(readings) {
  if (!readings || readings.length === 0) return null;
  const last = [...readings].sort((a, b) => a.hour - b.hour)[readings.length - 1];
  const frac = solarFraction(last.hour);
  return frac <= 0 ? null : last.kwh / frac;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const kwh = payload.find(p => p.dataKey === "kwh");
  return (
    <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {kwh && <div style={{ color: "#2ecc71", fontWeight: 600 }}>{fmt(kwh.value, 1)} kWh</div>}
      {kwh && <div style={{ color: "#f39c12", fontWeight: 600 }}>{fmt(calcDayValue(kwh.value), 1)} ₪</div>}
    </div>
  );
};

export default function SolarTracker() {
  const today = new Date().toISOString().split("T")[0];
  const [log, setLog] = useState(() => {
    const ex = loadLog();
    if (ex.length === 0) {
      const seed = [{ date: "2026-08-13", kwh: 80 }, { date: "2026-08-14", kwh: 93.3 }, { date: "2026-08-15", kwh: 18.3 }];
      saveLog(seed); return seed;
    }
    return ex;
  });
  const [intraday, setIntraday] = useState(() => loadIntraday());
  const [view, setView] = useState("today");
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [manualKwh, setManualKwh] = useState("");
  const [lastImage, setLastImage] = useState(null);
  const fileRef = useRef();

  const todayReadings = intraday[today] || [];
  const latestReading = todayReadings.length > 0 ? [...todayReadings].sort((a,b) => b.hour - a.hour)[0] : null;
  const projected = projectEndOfDay(todayReadings);
  const displayKwh = log.find(e => e.date === today)?.kwh || latestReading?.kwh || null;

  function addReading(hour, kwh, date) {
    const d = date || today;
    setIntraday(prev => {
      const updated = { ...prev, [d]: [...(prev[d] || []).filter(r => Math.abs(r.hour - hour) > 0.2), { hour, kwh }] };
      saveIntraday(updated); return updated;
    });
    setLog(prev => {
      const updated = [...prev.filter(e => e.date !== d), { date: d, kwh }].sort((a,b) => a.date.localeCompare(b.date));
      saveLog(updated); return updated;
    });
  }

  async function analyzeImage(file) {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(",")[1];
      setLastImage(e.target.result);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 500,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: `Extract from SolarEdge screenshot. Look at the STATUS BAR clock at the TOP of the phone screen (e.g. "10:04", "14:30", "8:35"). Return ONLY JSON:
{"kwh":<today kWh production or null>,"current_kw":<solar kW now or null>,"time_hour":<decimal hour from STATUS BAR CLOCK e.g. 10.07 for 10:04, 14.5 for 14:30 — NOT from any other time in the image>,"date":"<YYYY-MM-DD from screenshot date or null>"}` }
            ]}]
          })
        });
        const data = await resp.json();
        const text = data.content?.[0]?.text?.replace(/```json|```/g, "").trim() || "{}";
        const parsed = JSON.parse(text);
        const hour = parsed.time_hour || nowHour();
        const kwh = parsed.kwh;
        const date = parsed.date || today;
        if (kwh) {
          addReading(hour, kwh, date);
          const proj = projectEndOfDay([...(intraday[date] || []), { hour, kwh }]);
          setFlash(`✓ ${fmt(kwh,1)} kWh · ${timeLabel(hour)}${proj ? ` · צפי: ~${fmt(proj,0)} kWh` : ""}`);
        } else { setFlash("לא זיהיתי — נסה Day view"); }
      } catch { setFlash("שגיאה בניתוח"); }
      setTimeout(() => setFlash(null), 5000);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  function handleManual() {
    const v = parseFloat(manualKwh);
    if (!isNaN(v) && v > 0) {
      addReading(nowHour(), v, today);
      setManualKwh("");
      const proj = projectEndOfDay([...(todayReadings), { hour: nowHour(), kwh: v }]);
      setFlash(`✓ ${fmt(v,1)} kWh · ${timeLabel(nowHour())}${proj ? ` · צפי: ~${fmt(proj,0)} kWh` : ""}`);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  // Stats — past days only for avg
  const pastDays = log.filter(e => e.date !== today);
  const totalProduced = log.reduce((s, e) => s + (e.kwh || 0), 0);
  const avgDaily = pastDays.length > 0 ? pastDays.reduce((s, e) => s + (e.kwh || 0), 0) / pastDays.length : 0;
  const totalValue = log.reduce((s, e) => s + calcDayValue(e.kwh || 0), 0);
  const loanRepaidPct = Math.min(100, (totalValue / LOAN_AMOUNT) * 100);
  const monthlyIncome = calcDayValue(avgDaily) * 30;
  const annualIncome = calcDayValue(avgDaily) * 365;
  const yearsToRepay = annualIncome > 0 ? LOAN_AMOUNT / annualIncome : null;
  const coveragePct = LOAN_MONTHLY > 0 ? Math.min(100, (monthlyIncome / LOAN_MONTHLY) * 100) : 0;

  const last7 = log.slice(-7);
  const weekTotal = last7.reduce((s, e) => s + (e.kwh || 0), 0);
  const weekValue = last7.reduce((s, e) => s + calcDayValue(e.kwh || 0), 0);
  const dailyChart = last7.map(e => ({ label: dateLabel(e.date), kwh: e.kwh, value: Math.round(calcDayValue(e.kwh)) }));
  const readingPoints = [...todayReadings].sort((a,b) => a.hour - b.hour).map(r => ({ label: timeLabel(r.hour), kwh: r.kwh }));

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#fff", fontFamily: "'SF Pro Display', -apple-system, sans-serif", direction: "rtl", padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#2ecc71", letterSpacing: 1.5, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2ecc71", display: "inline-block", boxShadow: "0 0 6px #2ecc71" }} />
          מונה חוזר · 0.635 ₪/kWh · {SYSTEM_KWP} kWp · 35 פאנלים
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>מאור גורין ☀️</div>
        <div style={{ color: "#444", fontSize: 11, marginTop: 2 }}>מאז {dateLabel(INSTALL_DATE)} · {log.length} ימי נתונים</div>
      </div>

      {/* Upload */}
      <div onClick={() => fileRef.current.click()} style={{
        background: uploading ? "#0d1f14" : "#0d0d0d",
        border: `1.5px dashed ${uploading ? "#2ecc71" : "#222"}`,
        borderRadius: 14, padding: "14px 18px", marginBottom: 10,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
      }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => e.target.files[0] && analyzeImage(e.target.files[0])} />
        <div style={{ fontSize: 22 }}>{uploading ? "⚡" : "📲"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: uploading ? "#2ecc71" : "#fff" }}>
            {uploading ? "מנתח..." : "העלה סקרינשוט"}
          </div>
          <div style={{ fontSize: 11, color: "#555" }}>כל העלאה נשמרת עם השעה</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastImage && <img src={lastImage} alt="last" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid #2a2a2a" }} />}
          {displayKwh && (
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#2ecc71", fontSize: 22, fontWeight: 700 }}>{fmt(displayKwh, 1)}</div>
              <div style={{ color: "#555", fontSize: 10 }}>kWh היום</div>
            </div>
          )}
        </div>
      </div>

      {/* Manual */}
      <div style={{ display: "flex", gap: 8, marginBottom: flash ? 8 : 16 }}>
        <input value={manualKwh} onChange={e => setManualKwh(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleManual()}
          placeholder="kWh ידנית עכשיו"
          style={{ flex: 1, background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, color: "#fff", padding: "9px 14px", fontSize: 13, outline: "none" }} />
        <button onClick={handleManual} style={{ background: "#0d2a1a", border: "1px solid #2ecc71", color: "#2ecc71", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ הוסף</button>
      </div>

      {flash && <div style={{ background: "#0d2a1a", border: "1px solid #2ecc71", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#2ecc71", lineHeight: 1.6 }}>{flash}</div>}

      {/* Today summary */}
      {todayReadings.length > 0 && (
        <div style={{ background: "#0f0f0f", borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid #181818" }}>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>היום · {todayReadings.length} קריאות</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {[
              { label: "עכשיו", value: fmt(latestReading?.kwh, 1), unit: "kWh", sub: latestReading ? timeLabel(latestReading.hour) : "" },
              { label: "צפי לסיום", value: projected ? fmt(projected, 0) : "—", unit: "kWh", sub: "~19:30", accent: true },
              { label: "שווי צפוי", value: projected ? fmt(projected * TARIFF, 1) : "—", unit: "₪", sub: "להיום" },
            ].map((k, i) => (
              <div key={i} style={{ flex: 1, background: k.accent ? "#0d2a1a" : "#141414", borderRadius: 10, padding: "12px 10px", border: `1px solid ${k.accent ? "#2ecc71" : "#1e1e1e"}` }}>
                <div style={{ color: "#555", fontSize: 10, marginBottom: 4 }}>{k.label}</div>
                <div style={{ color: k.accent ? "#2ecc71" : "#fff", fontSize: 18, fontWeight: 700 }}>{k.value}</div>
                <div style={{ color: "#444", fontSize: 10, marginTop: 2 }}>{k.unit} · {k.sub}</div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ color: "#444", fontSize: 10, marginBottom: 8 }}>ציר זמן קריאות</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: projected ? 14 : 0 }}>
            {[...todayReadings].sort((a,b) => a.hour - b.hour).map((r, i) => (
              <div key={i} style={{ background: "#181818", borderRadius: 8, padding: "6px 10px", border: "1px solid #252525" }}>
                <div style={{ color: "#888", fontSize: 10 }}>{timeLabel(r.hour)}</div>
                <div style={{ color: "#2ecc71", fontSize: 13, fontWeight: 600 }}>{fmt(r.kwh, 1)} kWh</div>
              </div>
            ))}
          </div>

          {projected && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#555", fontSize: 10 }}>התקדמות יום</span>
                <span style={{ color: "#2ecc71", fontSize: 10 }}>{fmt((latestReading?.kwh / projected) * 100, 0)}%</span>
              </div>
              <div style={{ background: "#181818", borderRadius: 6, height: 6 }}>
                <div style={{ width: `${Math.min(100, (latestReading?.kwh / projected) * 100)}%`, background: "linear-gradient(90deg, #1a5c38, #2ecc71)", height: "100%", borderRadius: 6 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ color: "#444", fontSize: 10 }}>{fmt(latestReading?.kwh, 1)} kWh</span>
                <span style={{ color: "#444", fontSize: 10 }}>צפי: {fmt(projected, 0)} kWh</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["today","היום"],["week","שבוע"],["roi","ROI"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{
            background: view === v ? "#0d2a1a" : "#0f0f0f",
            border: `1px solid ${view === v ? "#2ecc71" : "#1e1e1e"}`,
            color: view === v ? "#2ecc71" : "#666",
            borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}>{l}</button>
        ))}
      </div>

      {/* Today chart */}
      {view === "today" && readingPoints.length > 1 && (
        <div style={{ background: "#0f0f0f", borderRadius: 14, padding: "18px 12px 12px", border: "1px solid #181818", marginBottom: 16 }}>
          <div style={{ color: "#666", fontSize: 11, marginBottom: 14, paddingRight: 4 }}>קריאות היום · kWh מצטבר</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={readingPoints}>
              <defs>
                <linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2ecc71" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2ecc71", strokeWidth: 1 }} />
              {projected && <ReferenceLine y={projected} stroke="#f39c12" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: `צפי ${fmt(projected,0)}`, fill: "#f39c12", fontSize: 9, position: "right" }} />}
              <Area type="monotone" dataKey="kwh" name="ייצור" stroke="#2ecc71" strokeWidth={2} fill="url(#todayGrad)" dot={{ fill: "#2ecc71", r: 5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weekly chart */}
      {view === "week" && dailyChart.length > 0 && (
        <div style={{ background: "#0f0f0f", borderRadius: 14, padding: "18px 12px 12px", border: "1px solid #181818", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, paddingRight: 4 }}>
            <span style={{ color: "#666", fontSize: 11 }}>7 ימים אחרונים</span>
            <span style={{ color: "#2ecc71", fontSize: 11, fontWeight: 600 }}>{fmt(weekTotal, 0)} kWh · {fmt(weekValue, 0)} ₪ · ממוצע {fmt(weekValue/Math.min(last7.length,7), 0)} ₪/יום</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dailyChart} barSize={28}>
              <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff05" }} />
              <ReferenceLine y={85} stroke="#f39c12" strokeDasharray="4 4" strokeWidth={1} label={{ value: "יעד", fill: "#f39c12", fontSize: 9, position: "right" }} />
              <Bar dataKey="kwh" name="kWh" radius={[5,5,0,0]}>
                {dailyChart.map((e, i) => <Cell key={i} fill={e.kwh >= 90 ? "#2ecc71" : e.kwh >= 70 ? "#27ae60" : "#1a5c38"} />)}
              </Bar>

            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary panel */}
      {view === "week" && (
        <div style={{ background: "#0f0f0f", borderRadius: 14, padding: 16, border: "1px solid #181818", marginBottom: 16 }}>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>סיכום כספי · מונה חוזר</div>
          {[
            { label: "שבועי", kwh: weekTotal, value: weekValue },
            { label: "חודשי (צפי)", kwh: calcDayValue(avgDaily) > 0 ? avgDaily * 30 : 0, value: monthlyIncome },
            { label: "שנתי (צפי)", kwh: avgDaily * 365, value: annualIncome },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < 2 ? 10 : 0, marginBottom: i < 2 ? 10 : 0, borderBottom: i < 2 ? "1px solid #161616" : "none" }}>
              <div>
                <div style={{ color: "#aaa", fontSize: 13 }}>{r.label}</div>
                <div style={{ color: "#555", fontSize: 11 }}>{fmt(r.kwh, 0)} kWh</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <span style={{ color: "#2ecc71", fontSize: 22, fontWeight: 700 }}>{fmt(r.value, 0)}</span>
                <span style={{ color: "#555", fontSize: 12, marginRight: 4 }}>₪</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ROI */}
      {view === "roi" && (
        <div style={{ background: "#0f0f0f", borderRadius: 14, padding: 18, border: "1px solid #181818", marginBottom: 16 }}>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 14 }}>תחזית · ממוצע {fmt(avgDaily,1)} kWh/יום</div>
          {[
            { label: "הכנסה חודשית", value: fmt(monthlyIncome, 0), unit: "₪/חודש" },
            { label: "החזר הלוואה", value: fmt(LOAN_MONTHLY, 0), unit: "₪/חודש", sub: "5 שנים · פריים-0.1%" },
            { label: "כיסוי הלוואה", value: fmt(coveragePct, 1), unit: "%", highlight: true, color: coveragePct >= 100 ? "#2ecc71" : "#f39c12" },
            { label: "עודף/גרעון חודשי", value: fmt(monthlyIncome - LOAN_MONTHLY, 0), unit: "₪/חודש", color: monthlyIncome >= LOAN_MONTHLY ? "#2ecc71" : "#e74c3c" },
            { label: "הכנסה שנתית", value: fmt(annualIncome, 0), unit: "₪/שנה" },
            { label: "סה״כ 25 שנה", value: fmt(annualIncome * 25, 0), unit: "₪", highlight: true },
            { label: "החזר הלוואה", value: yearsToRepay ? yearsToRepay.toFixed(1) : "—", unit: "שנים" },
          ].map((r, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: r.highlight ? "10px 12px" : "0 0 10px",
              marginBottom: 10,
              background: r.highlight ? "#0d2a1a" : "transparent",
              borderBottom: !r.highlight ? "1px solid #111" : "none",
              borderRadius: r.highlight ? 10 : 0,
            }}>
              <div>
                <div style={{ color: r.highlight ? (r.color || "#2ecc71") : "#aaa", fontSize: 13, fontWeight: r.highlight ? 600 : 400 }}>{r.label}</div>
                {r.sub && <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>{r.sub}</div>}
              </div>
              <div>
                <span style={{ color: r.color || (r.highlight ? "#2ecc71" : "#fff"), fontSize: r.highlight ? 22 : 18, fontWeight: 700 }}>{r.value}</span>
                <span style={{ color: "#555", fontSize: 11, marginRight: 4 }}>{r.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loan progress */}
      <div style={{ background: "#0f0f0f", borderRadius: 14, padding: 16, border: "1px solid #181818" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#888", fontSize: 12 }}>החזר הלוואה (80,000 ₪)</span>
          <span style={{ color: "#f39c12", fontSize: 12, fontWeight: 600 }}>{fmt(loanRepaidPct, 3)}%</span>
        </div>
        <div style={{ background: "#181818", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ width: `${loanRepaidPct}%`, background: "linear-gradient(90deg, #1a5c38, #2ecc71)", height: "100%", borderRadius: 6 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#555", fontSize: 11 }}>נצבר: {fmt(totalValue, 0)} ₪</span>
          <span style={{ color: "#555", fontSize: 11 }}>נותר: {fmt(Math.max(0, LOAN_AMOUNT - totalValue), 0)} ₪</span>
        </div>
      </div>

      <div style={{ textAlign: "center", color: "#222", fontSize: 10, marginTop: 16 }}>
        מונה חוזר · 0.635 ₪/kWh · SolarEdge {SYSTEM_KWP} kWp · 35 פאנלים
      </div>
    </div>
  );
}
