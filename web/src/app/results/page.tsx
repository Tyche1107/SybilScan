"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://45.76.152.169:8001";

type Risk = "high" | "medium" | "low" | "unknown" | "error";

interface ResultRow {
  address: string;
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
  const header = "address,score,risk,sybil_type,tx_count,wallet_age_days,nft_collections,unique_contracts,total_volume_eth";
  const rows = results.map(r =>
    [r.address, r.score ?? "", r.risk, r.sybil_type, r.tx_count ?? "", r.wallet_age_days ?? "", r.nft_collections ?? "", r.unique_contracts ?? "", r.total_volume_eth ?? ""].join(",")
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

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API_URL}/v1/jobs/${jobId}`);
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
      <div style={{ textAlign: "center", marginTop: 80, color: "#475569" }}>
        <p>No job ID. <a href="/" style={{ color: "#a78bfa" }}>Start a scan</a></p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ textAlign: "center", marginTop: 80, color: "#94a3b8" }}>Loading results...</div>;
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", marginTop: 80 }}>
        <div style={{ color: "#ef4444" }}>{error}</div>
        <a href="/" style={{ color: "#a78bfa", display: "block", marginTop: 16 }}>New scan</a>
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
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ borderBottom: "1px solid #0f172a", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/")} style={{
          background: "none", border: "none", color: "#e2e8f0", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa" }} />
          SybilScan
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {job.status === "complete" && (
            <button onClick={() => downloadCsv(job.results, job.job_id)} style={{
              background: "#1e293b", border: "none", color: "#e2e8f0", borderRadius: 6,
              padding: "6px 16px", fontSize: 13, cursor: "pointer",
            }}>
              Export CSV
            </button>
          )}
          <button onClick={() => router.push("/")} style={{
            background: "#a78bfa", border: "none", color: "#030712", borderRadius: 6,
            padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            New scan
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 4 }}>
            Job {job.job_id}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            {job.status === "complete" ? "Scan complete" : `Scanning... ${pct}%`}
          </h1>

          {job.status !== "complete" && (
            <div style={{ marginTop: 12, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden", maxWidth: 400 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#a78bfa", borderRadius: 4, transition: "width 0.5s" }} />
            </div>
          )}
        </div>

        {/* summary cards */}
        {job.summary && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            {[
              ["Total",  job.summary.total,   "#94a3b8"],
              ["High",   job.summary.high,    "#ef4444"],
              ["Medium", job.summary.medium,  "#f59e0b"],
              ["Low",    job.summary.low,     "#22c55e"],
              ["Unknown",job.summary.unknown, "#6b7280"],
            ].map(([label, val, color]) => (
              <div key={label as string} style={{
                background: "#0f172a", border: `1px solid #1e293b`, borderRadius: 10,
                padding: "14px 20px", minWidth: 90,
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: color as string }}>{val}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          {(["all", "high", "medium", "low"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f === filter ? "all" : f)} style={{
              background: filter === f ? "#1e293b" : "transparent",
              border: `1px solid ${filter === f ? "#334155" : "#1e293b"}`,
              color: filter === f ? "#e2e8f0" : "#475569",
              borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer",
              textTransform: "capitalize",
            }}>
              {f}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by address..."
            style={{
              background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6,
              padding: "5px 12px", color: "#e2e8f0", fontSize: 12, outline: "none",
              width: 240,
            }}
          />
          <span style={{ fontSize: 12, color: "#475569", marginLeft: "auto" }}>
            {filtered.length} addresses
          </span>
        </div>

        {/* results table */}
        <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden", border: "1px solid #1e293b" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Address", "Score", "Risk", "Type", "Txs", "Age", "NFT coll.", "Volume (ETH)"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r, i) => (
                <tr key={r.address} style={{ borderBottom: "1px solid #0f172a", background: i % 2 === 0 ? "transparent" : "#060d1a" }}>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>
                    {r.address.slice(0, 8)}...{r.address.slice(-6)}
                  </td>
                  <td style={{ padding: "9px 14px", fontWeight: 700, color: RISK_COLOR[r.risk] || "#6b7280" }}>
                    {r.score != null ? (r.score * 100).toFixed(0) : "--"}
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
                  <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 12 }}>{r.sybil_type?.replace("_", " ")}</td>
                  <td style={{ padding: "9px 14px", color: "#64748b" }}>{r.tx_count ?? "--"}</td>
                  <td style={{ padding: "9px 14px", color: "#64748b" }}>
                    {r.wallet_age_days != null ? `${Math.round(r.wallet_age_days)}d` : "--"}
                  </td>
                  <td style={{ padding: "9px 14px", color: "#64748b" }}>{r.nft_collections ?? "--"}</td>
                  <td style={{ padding: "9px 14px", color: "#64748b" }}>
                    {r.total_volume_eth != null ? r.total_volume_eth.toFixed(3) : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div style={{ padding: "12px 14px", color: "#475569", fontSize: 12, borderTop: "1px solid #1e293b" }}>
              Showing 500 of {filtered.length}. Export CSV for full results.
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
