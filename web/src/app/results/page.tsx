"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PAGE_SIZE = 50;

interface AddressResult {
  address: string;
  score: number;
  risk: "high" | "medium" | "low";
  type: string;
}

interface JobData {
  status: string;
  results?: AddressResult[];
  error?: string;
}

function getRisk(score: number): "high" | "medium" | "low" {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

const RISK_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#22c55e",
};

const RISK_BG: Record<string, string> = {
  high: "rgba(239,68,68,0.08)",
  medium: "rgba(234,179,8,0.08)",
  low: "transparent",
};

function buildBins(results: AddressResult[]) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    label: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
    count: 0,
  }));
  for (const r of results) {
    const idx = Math.min(Math.floor(r.score * 10), 9);
    bins[idx].count += 1;
  }
  return bins;
}

function downloadCSV(filename: string, rows: string[][], header: string[]) {
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: `${RISK_COLORS[risk]}22`,
        color: RISK_COLORS[risk],
        border: `1px solid ${RISK_COLORS[risk]}44`,
        textTransform: "capitalize",
      }}
    >
      {risk.charAt(0).toUpperCase() + risk.slice(1)}
    </span>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!jobId) return;
    const fetchJob = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Failed to fetch job: ${res.status}`);
        const data: JobData = await res.json();
        setJobData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results.");
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: "16px" }}>Loading results...</div>
      </div>
    );
  }

  if (error || !jobData) {
    return (
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ color: "#ef4444" }}>{error || "Job not found."}</div>
        <Link href="/" style={{ color: "#8b5cf6", marginTop: "16px", display: "inline-block" }}>
          Scan Again
        </Link>
      </div>
    );
  }

  const results: AddressResult[] = (jobData.results || []).map((r) => ({
    ...r,
    risk: r.risk || getRisk(r.score),
  }));

  const sorted = [...results].sort((a, b) => b.score - a.score);

  const total = sorted.length;
  const highRisk = sorted.filter((r) => r.risk === "high").length;
  const mediumRisk = sorted.filter((r) => r.risk === "medium").length;
  const lowRisk = sorted.filter((r) => r.risk === "low").length;

  const bins = buildBins(sorted);

  const excluded = sorted.filter((r) => r.score > threshold);
  const excludedPct = total > 0 ? ((excluded.length / total) * 100).toFixed(1) : "0.0";

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleDownloadSafe = () => {
    const safe = sorted.filter((r) => r.score <= threshold);
    downloadCSV(
      "safe-list.csv",
      safe.map((r) => [r.address, r.score.toFixed(4), r.risk, r.type || ""]),
      ["address", "score", "risk", "type"]
    );
  };

  const handleDownloadFull = () => {
    downloadCSV(
      "full-results.csv",
      sorted.map((r) => [r.address, r.score.toFixed(4), r.risk, r.type || ""]),
      ["address", "score", "risk", "type"]
    );
  };

  const cardStyle = (borderColor: string) => ({
    background: "#1a202c",
    border: `1px solid ${borderColor}`,
    borderRadius: "10px",
    padding: "20px 24px",
    flex: 1,
    minWidth: "140px",
  });

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#e2e8f0" }}>
          Scan Results
        </h1>
        <Link
          href="/"
          style={{
            color: "#8b5cf6",
            fontSize: "14px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          ← Scan Again
        </Link>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px", flexWrap: "wrap" }}>
        <div style={cardStyle("#2d3748")}>
          <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>Total Scanned</div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#e2e8f0" }}>{total}</div>
        </div>
        <div style={cardStyle("rgba(239,68,68,0.3)")}>
          <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>High Risk</div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#ef4444" }}>{highRisk}</div>
        </div>
        <div style={cardStyle("rgba(234,179,8,0.3)")}>
          <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>Medium Risk</div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#eab308" }}>{mediumRisk}</div>
        </div>
        <div style={cardStyle("rgba(34,197,94,0.3)")}>
          <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>Low Risk</div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#22c55e" }}>{lowRisk}</div>
        </div>
      </div>

      {/* Score Distribution Chart */}
      <div
        style={{
          background: "#1a202c",
          border: "1px solid #2d3748",
          borderRadius: "10px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0", marginBottom: "16px" }}>
          Score Distribution
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bins} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#2d3748" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1a202c",
                border: "1px solid #2d3748",
                borderRadius: "6px",
                color: "#e2e8f0",
                fontSize: "13px",
              }}
              cursor={{ fill: "rgba(139,92,246,0.1)" }}
            />
            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Threshold Slider */}
      <div
        style={{
          background: "#1a202c",
          border: "1px solid #2d3748",
          borderRadius: "10px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <label style={{ fontSize: "15px", fontWeight: 600, color: "#e2e8f0" }}>
            Exclusion threshold
          </label>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "#8b5cf6",
              background: "rgba(139,92,246,0.1)",
              padding: "2px 10px",
              borderRadius: "6px",
            }}
          >
            {threshold.toFixed(2)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          onChange={(e) => {
            setThreshold(parseFloat(e.target.value));
            setPage(0);
          }}
          style={{ width: "100%", accentColor: "#8b5cf6", cursor: "pointer" }}
        />

        <div style={{ marginTop: "16px", color: "#94a3b8", fontSize: "14px", marginBottom: "16px" }}>
          Excluding{" "}
          <strong style={{ color: "#e2e8f0" }}>{excluded.length}</strong> addresses (
          <strong style={{ color: "#e2e8f0" }}>{excludedPct}%</strong>) above threshold
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={handleDownloadSafe}
            style={{
              padding: "9px 18px",
              background: "rgba(34,197,94,0.15)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: "7px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Download Safe List
          </button>
          <button
            onClick={handleDownloadFull}
            style={{
              padding: "9px 18px",
              background: "rgba(139,92,246,0.15)",
              color: "#8b5cf6",
              border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: "7px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Download Full Results
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div
        style={{
          background: "#1a202c",
          border: "1px solid #2d3748",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2d3748" }}>
              {["Address", "Score", "Risk", "Type"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#94a3b8",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => {
              const risk = row.risk || getRisk(row.score);
              return (
                <tr
                  key={i}
                  style={{
                    background: RISK_BG[risk],
                    borderBottom: "1px solid #2d374840",
                  }}
                >
                  <td
                    style={{
                      padding: "11px 16px",
                      fontFamily: "monospace",
                      fontSize: "13px",
                      color: "#e2e8f0",
                      maxWidth: "300px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.address}
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: "14px", color: "#e2e8f0", fontWeight: 600 }}>
                    {row.score.toFixed(2)}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <RiskBadge risk={risk} />
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: "13px", color: "#94a3b8" }}>
                    {row.type || "—"}
                  </td>
                </tr>
              );
            })}
            {pageData.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}
                >
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: "1px solid #2d3748",
            }}
          >
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>
              Page {page + 1} of {totalPages} — {sorted.length} addresses
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: "6px 14px",
                  background: "#0f1117",
                  border: "1px solid #2d3748",
                  borderRadius: "6px",
                  color: page === 0 ? "#4a5568" : "#e2e8f0",
                  cursor: page === 0 ? "not-allowed" : "pointer",
                  fontSize: "13px",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  padding: "6px 14px",
                  background: "#0f1117",
                  border: "1px solid #2d3748",
                  borderRadius: "6px",
                  color: page >= totalPages - 1 ? "#4a5568" : "#e2e8f0",
                  cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                  fontSize: "13px",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ color: "#94a3b8" }}>Loading...</div>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
