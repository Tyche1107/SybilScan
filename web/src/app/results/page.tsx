"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

type Risk = "high" | "medium" | "low" | "unknown" | "error";
type Lang = "en" | "zh";

const DARK = {
  bg: "#030712", bg2: "#0f172a", bg3: "#1e293b",
  border: "#0f172a", border2: "#1e293b",
  text: "#f8fafc", text2: "#e2e8f0", text3: "#94a3b8", text4: "#475569",
  accent: "#a78bfa", row: "#060d1a",
};
const LIGHT = {
  bg: "#f8fafc", bg2: "#ffffff", bg3: "#f1f5f9",
  border: "#e2e8f0", border2: "#e2e8f0",
  text: "#0f172a", text2: "#1e293b", text3: "#475569", text4: "#94a3b8",
  accent: "#7c3aed", row: "#f8fafc",
};

const TR = {
  en: {
    scan_complete: "Scan complete", scanning: (pct: number) => `Scanning... ${pct}%`,
    total: "Total", high: "High", medium: "Medium", low: "Low", unknown: "Unknown",
    all: "All", filter_placeholder: "Filter by address...", addresses: (n: number) => `${n} addresses`,
    export: "Export CSV", new_scan: "New scan",
    cols: ["Address","Score","Risk","Type","Txs","Age","NFT coll.","Volume (ETH)"],
    showing: (n: number, total: number) => `Showing 500 of ${total}. Export CSV for full results.`,
    loading: "Loading results...", no_job: "No job ID.",
    start_scan: "Start a scan", job_not_found: "Failed to load results",
  },
  zh: {
    scan_complete: "扫描完成", scanning: (pct: number) => `扫描中... ${pct}%`,
    total: "总计", high: "高风险", medium: "中风险", low: "低风险", unknown: "未知",
    all: "全部", filter_placeholder: "按地址筛选...", addresses: (n: number) => `${n} 个地址`,
    export: "导出 CSV", new_scan: "新扫描",
    cols: ["地址","评分","风险","类型","交易数","钱包年龄","NFT集合","交易量(ETH)"],
    showing: (n: number, total: number) => `显示 500 / ${total}。完整结果请导出 CSV。`,
    loading: "加载结果中...", no_job: "无 Job ID。",
    start_scan: "开始扫描", job_not_found: "无法加载结果",
  },
};

interface ResultRow {
  address: string;
  sybil_score?: number;
  score: number | null;
  risk: Risk;
  sybil_type: string;
  tx_count?: number;
  wallet_age_days?: number;
  nft_collections?: number;
  unique_contracts?: number;
  total_volume_eth?: number;
  data_source?: string;
}

interface JobData {
  job_id: string;
  status: string;
  total: number;
  completed: number;
  progress: number;
  results: ResultRow[];
  summary: { total: number; high: number; medium: number; low: number; unknown: number };
  created_at: string;
  completed_at: string | null;
}

const RISK_COLOR: Record<string, string> = {
  high: "#ef4444", medium: "#f59e0b", low: "#22c55e", unknown: "#6b7280", error: "#6b7280",
};

function downloadCsv(results: ResultRow[], jobId: string) {
  const header = "address,sybil_score,score,risk,sybil_type,tx_count,wallet_age_days,nft_collections,unique_contracts,total_volume_eth";
  const rows = results.map(r =>
    [r.address, r.sybil_score ?? (r.score != null ? Math.round(r.score * 100) : ""), r.score ?? "", r.risk, r.sybil_type, r.tx_count ?? "", r.wallet_age_days ?? "", r.nft_collections ?? "", r.unique_contracts ?? "", r.total_volume_eth ?? ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `sybilscan_${jobId.slice(0, 8)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function ResultsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get("job_id");

  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Risk>("all");
  const [search, setSearch] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  const theme = isDark ? DARK : LIGHT;
  const t = TR[lang];

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error("Job not found");
      const data: JobData = await res.json();
      setJob(data);
      if (data.status !== "complete") {
        setTimeout(fetchJob, 2000);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  if (!jobId) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: theme.text4 }}>
          <p>{t.no_job} <a href="/" style={{ color: theme.accent }}>{t.start_scan}</a></p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", color: theme.text3 }}>
        {t.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#ef4444" }}>{error}</div>
          <a href="/" style={{ color: theme.accent, display: "block", marginTop: 16 }}>{t.new_scan}</a>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const filtered = job.results.filter(r => {
    const matchRisk = filter === "all" || r.risk === filter;
    const matchSearch = !search || r.address.toLowerCase().includes(search.toLowerCase());
    return matchRisk && matchSearch;
  });

  const pct = Math.round((job.progress || 0) * 100);

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "system-ui, sans-serif", transition: "background 0.2s, color 0.2s" }}>
      <nav style={{ borderBottom: `1px solid ${theme.border}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/")} style={{
          background: "none", border: "none", color: theme.text, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
          SybilScan
        </button>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {job.status === "complete" && (
            <button onClick={() => downloadCsv(job.results, job.job_id)} style={{
              background: theme.bg3, border: `1px solid ${theme.border2}`, color: theme.text2, borderRadius: 6,
              padding: "6px 16px", fontSize: 13, cursor: "pointer",
            }}>
              {t.export}
            </button>
          )}
          <button onClick={() => setLang(l => l === "en" ? "zh" : "en")} style={{
            background: theme.bg3, border: `1px solid ${theme.border2}`, borderRadius: 6,
            padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: theme.text3,
          }}>
            {lang === "en" ? "中文" : "EN"}
          </button>
          <button onClick={() => setIsDark(d => !d)} style={{
            background: theme.bg3, border: `1px solid ${theme.border2}`, borderRadius: 6,
            padding: "4px 10px", fontSize: 12, cursor: "pointer", color: theme.text3,
          }}>
            {isDark ? "☀" : "◑"}
          </button>
          <button onClick={() => router.push("/")} style={{
            background: theme.accent, border: "none", color: isDark ? "#030712" : "#ffffff", borderRadius: 6,
            padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {t.new_scan}
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: theme.text4, fontFamily: "monospace", marginBottom: 4 }}>
            Job {job.job_id}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, color: theme.text }}>
            {job.status === "complete" ? t.scan_complete : t.scanning(pct)}
          </h1>

          {job.status !== "complete" && (
            <div style={{ marginTop: 12, background: theme.bg2, borderRadius: 4, height: 6, overflow: "hidden", maxWidth: 400 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: theme.accent, borderRadius: 4, transition: "width 0.5s" }} />
            </div>
          )}
        </div>

        {/* summary cards */}
        {job.summary && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            {[
              [t.total,   job.summary.total,   theme.text3],
              [t.high,    job.summary.high,    "#ef4444"],
              [t.medium,  job.summary.medium,  "#f59e0b"],
              [t.low,     job.summary.low,     "#22c55e"],
              [t.unknown, job.summary.unknown, "#6b7280"],
            ].map(([label, val, color]) => (
              <div key={label as string} style={{
                background: theme.bg2, border: `1px solid ${theme.border2}`, borderRadius: 10,
                padding: "14px 20px", minWidth: 90,
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: color as string }}>{val}</div>
                <div style={{ fontSize: 11, color: theme.text4, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          {(["all", "high", "medium", "low"] as const).map(f => {
            const label = f === "all" ? t.all : f === "high" ? t.high : f === "medium" ? t.medium : t.low;
            return (
              <button key={f} onClick={() => setFilter(f === filter ? "all" : f)} style={{
                background: filter === f ? theme.bg3 : "transparent",
                border: `1px solid ${filter === f ? theme.border2 : theme.border}`,
                color: filter === f ? theme.text : theme.text4,
                borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer",
              }}>
                {label}
              </button>
            );
          })}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.filter_placeholder}
            style={{
              background: theme.bg2, border: `1px solid ${theme.border2}`, borderRadius: 6,
              padding: "5px 12px", color: theme.text, fontSize: 12, outline: "none",
              width: 240,
            }}
          />
          <span style={{ fontSize: 12, color: theme.text4, marginLeft: "auto" }}>
            {t.addresses(filtered.length)}
          </span>
        </div>

        {/* results table */}
        <div style={{ background: theme.bg2, borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.border2}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border2}` }}>
                {t.cols.map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: theme.text4, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r, i) => (
                <tr key={r.address} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? "transparent" : theme.bg3 }}>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 11, color: theme.text3 }}>
                    {r.address.slice(0, 8)}...{r.address.slice(-6)}
                  </td>
                  <td style={{ padding: "9px 14px", fontWeight: 700, color: RISK_COLOR[r.risk] || "#6b7280" }}>
                    {r.sybil_score ?? (r.score != null ? Math.round(r.score * 100) : "--")}<span style={{fontSize:11,fontWeight:400,color:theme.text4}}>/100</span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{
                      background: `${RISK_COLOR[r.risk] || "#6b7280"}18`,
                      color: RISK_COLOR[r.risk] || "#6b7280",
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                    }}>
                      {r.risk.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", color: theme.text3, fontSize: 12 }}>{r.sybil_type?.replace("_", " ")}</td>
                  <td style={{ padding: "9px 14px", color: theme.text3 }}>{r.tx_count ?? "--"}</td>
                  <td style={{ padding: "9px 14px", color: theme.text3 }}>
                    {r.wallet_age_days != null ? `${Math.round(r.wallet_age_days)}d` : "--"}
                  </td>
                  <td style={{ padding: "9px 14px", color: theme.text3 }}>{r.nft_collections ?? "--"}</td>
                  <td style={{ padding: "9px 14px", color: theme.text3 }}>
                    {r.total_volume_eth != null ? r.total_volume_eth.toFixed(3) : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div style={{ padding: "12px 14px", color: theme.text4, fontSize: 12, borderTop: `1px solid ${theme.border2}` }}>
              {t.showing(500, filtered.length)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#94a3b8" }}>Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
