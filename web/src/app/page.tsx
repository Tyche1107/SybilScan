"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://45.76.152.169:8001";

type Tab = "single" | "batch";
type Risk = "high" | "medium" | "low" | "unknown" | "error";

interface VerifyResult {
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
  error?: string;
  lgb_score?: number;
  if_score?: number;
}

const RISK_COLOR: Record<Risk, string> = {
  high:    "#ef4444",
  medium:  "#f59e0b",
  low:     "#22c55e",
  unknown: "#6b7280",
  error:   "#ef4444",
};

const RISK_LABEL: Record<Risk, string> = {
  high:    "HIGH RISK",
  medium:  "MEDIUM RISK",
  low:     "LOW RISK",
  unknown: "UNKNOWN",
  error:   "ERROR",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 60 ? "#ef4444" : pct >= 30 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Sybil probability</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: VerifyResult }) {
  if (!result) return null;
  const riskColor = RISK_COLOR[result.risk] || "#6b7280";
  const src = result.data_source;

  return (
    <div style={{
      background: "#0f172a", border: `1px solid ${riskColor}40`, borderRadius: 12,
      padding: "20px 24px", marginTop: 20, maxWidth: 560,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 4 }}>
            {result.address}
          </div>
          <div style={{
            display: "inline-block", background: `${riskColor}20`,
            color: riskColor, fontSize: 11, fontWeight: 700,
            padding: "2px 10px", borderRadius: 4, letterSpacing: 1,
          }}>
            {RISK_LABEL[result.risk]}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: riskColor, lineHeight: 1 }}>
            {result.score != null ? Math.round(result.score * 100) : "--"}
          </div>
          <div style={{ fontSize: 10, color: "#475569" }}>/ 100</div>
        </div>
      </div>

      {result.score != null && <ScoreBar score={result.score} />}

      {result.error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{result.error}</div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        marginTop: 16, paddingTop: 16, borderTop: "1px solid #1e293b",
      }}>
        {[
          ["Transactions",    result.tx_count ?? "--"],
          ["Wallet age",      result.wallet_age_days != null ? `${Math.round(result.wallet_age_days)}d` : "--"],
          ["NFT collections", result.nft_collections ?? "--"],
          ["Unique contracts",result.unique_contracts ?? "--"],
          ["Volume",          result.total_volume_eth != null ? `${result.total_volume_eth.toFixed(3)} ETH` : "--"],
          ["Sybil type",      result.sybil_type ?? "--"],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {result.lgb_score != null && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e293b", display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#475569" }}>LightGBM score</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{(result.lgb_score * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#475569" }}>Isolation Forest score</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{(result.if_score! * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#475569" }}>Data source</div>
            <div style={{ fontSize: 12, color: src === "live" ? "#a78bfa" : "#94a3b8" }}>
              {src === "live" ? "live (Etherscan)" : src === "cached" ? "cached (Blur dataset)" : src}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("single");

  // Single address
  const [singleAddr, setSingleAddr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [singleResult, setSingleResult] = useState<VerifyResult | null>(null);
  const [singleError, setSingleError] = useState("");

  // Batch
  const [batchText, setBatchText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStatus, setBatchStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSingleScan = async () => {
    const addr = singleAddr.trim();
    if (!addr || addr.length < 10) return;
    setScanning(true);
    setSingleResult(null);
    setSingleError("");
    try {
      const res = await fetch(`${API_URL}/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSingleResult(data);
    } catch (e: unknown) {
      setSingleError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const parseCsv = useCallback((text: string): string[] => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const header = lines[0]?.toLowerCase().split(",") ?? [];
    const idx = header.findIndex(h => h.includes("address"));
    if (idx === -1) return lines.slice(1).map(l => l.split(",")[0]?.trim()).filter(Boolean);
    return lines.slice(1).map(l => l.split(",")[idx]?.trim()).filter(Boolean);
  }, []);

  const getAddresses = useCallback(async (): Promise<string[]> => {
    if (batchText.trim()) {
      return batchText.split("\n").map(a => a.trim()).filter(Boolean);
    }
    if (csvFile) {
      return new Promise(resolve => {
        const r = new FileReader();
        r.onload = e => resolve(parseCsv(e.target?.result as string));
        r.readAsText(csvFile);
      });
    }
    return [];
  }, [batchText, csvFile, parseCsv]);

  const handleBatchScan = async () => {
    const addrs = await getAddresses();
    if (addrs.length === 0) return;
    setBatchScanning(true);
    setBatchProgress(0);
    setBatchStatus(`Submitting ${addrs.length} addresses...`);
    try {
      const res = await fetch(`${API_URL}/v1/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: addrs }),
      });
      const { job_id } = await res.json();
      setBatchStatus("Processing...");
      const poll = setInterval(async () => {
        const jr = await fetch(`${API_URL}/v1/jobs/${job_id}`);
        const j = await jr.json();
        setBatchProgress(Math.round((j.progress || 0) * 100));
        setBatchStatus(`Processing ${j.completed || 0} / ${j.total} addresses...`);
        if (j.status === "complete") {
          clearInterval(poll);
          setBatchScanning(false);
          router.push(`/results?job_id=${job_id}`);
        }
      }, 1500);
    } catch (e: unknown) {
      setBatchStatus(e instanceof Error ? e.message : "Error");
      setBatchScanning(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      {/* nav */}
      <nav style={{ borderBottom: "1px solid #0f172a", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa" }} />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.5 }}>SybilScan</span>
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#475569" }}>
          <a href="/results" style={{ color: "#475569", textDecoration: "none" }}>Results</a>
          <a href="https://github.com/Tyche1107/pre-airdrop-detection" target="_blank" rel="noreferrer" style={{ color: "#475569", textDecoration: "none" }}>Research</a>
          <a href="https://tyche1107.github.io/pre-airdrop-detection/MINDMAP.html" target="_blank" rel="noreferrer" style={{ color: "#475569", textDecoration: "none" }}>MINDMAP</a>
        </div>
      </nav>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "64px 24px" }}>
        {/* hero */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#a78bfa", textTransform: "uppercase", marginBottom: 12 }}>
            Pre-Airdrop Sybil Detection
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0, lineHeight: 1.1, color: "#f8fafc" }}>
            Score any address<br />before the airdrop drops
          </h1>
          <p style={{ color: "#475569", marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: 520 }}>
            LightGBM trained on Blur Season 2. 53K airdrop recipients, 9,817 sybil addresses. AUC 0.793 at T-30 (vs ARTEMIS post-hoc GNN 0.803).
            Validated on LayerZero (AUC 0.946). Detects sybil behavioral fingerprints 90+ days before distribution.
          </p>

          <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
            {[
              ["AUC 0.793", "Blur T-30"],
              ["AUC 0.946", "LayerZero"],
              ["T-180", "Signal stable"],
              ["67%", "Evasion cost"],
            ].map(([val, label]) => (
              <div key={val} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 14px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{val}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 2, background: "#0f172a", borderRadius: 8, padding: 4, marginBottom: 24, width: "fit-content" }}>
          {(["single", "batch"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "7px 20px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tab === t ? "#1e293b" : "transparent",
              color: tab === t ? "#e2e8f0" : "#475569",
              transition: "all 0.15s",
            }}>
              {t === "single" ? "Single address" : "Batch scan"}
            </button>
          ))}
        </div>

        {/* single address panel */}
        {tab === "single" && (
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={singleAddr}
                onChange={e => { setSingleAddr(e.target.value); setSingleResult(null); setSingleError(""); }}
                onKeyDown={e => e.key === "Enter" && handleSingleScan()}
                placeholder="0x... Ethereum address"
                style={{
                  flex: 1, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
                  padding: "12px 16px", color: "#e2e8f0", fontSize: 14, fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button onClick={handleSingleScan} disabled={scanning || !singleAddr.trim()} style={{
                background: "#a78bfa", color: "#030712", border: "none", borderRadius: 8,
                padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                opacity: scanning || !singleAddr.trim() ? 0.5 : 1, whiteSpace: "nowrap",
              }}>
                {scanning ? "Scanning..." : "Scan"}
              </button>
            </div>
            {scanning && (
              <div style={{ marginTop: 16, color: "#a78bfa", fontSize: 13 }}>
                Fetching on-chain data... (known addresses: instant, new addresses: ~10s)
              </div>
            )}
            {singleError && <div style={{ color: "#ef4444", marginTop: 12, fontSize: 13 }}>{singleError}</div>}
            {singleResult && <ResultCard result={singleResult} />}
          </div>
        )}

        {/* batch panel */}
        {tab === "batch" && (
          <div>
            <textarea
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              placeholder={"0xabc123...\n0xdef456...\nOne address per line (max 50,000)"}
              rows={6}
              style={{
                width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
                padding: "14px 16px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace",
                outline: "none", resize: "vertical", boxSizing: "border-box",
              }}
            />

            {/* CSV drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault(); setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) { setCsvFile(f); setBatchText(""); }
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                marginTop: 10, border: `1px dashed ${isDragging ? "#a78bfa" : "#1e293b"}`,
                borderRadius: 8, padding: "20px", textAlign: "center", cursor: "pointer",
                background: isDragging ? "#1e293b20" : "transparent", transition: "all 0.15s",
              }}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setCsvFile(f); setBatchText(""); } }} />
              <div style={{ color: "#475569", fontSize: 13 }}>
                {csvFile ? `${csvFile.name} selected` : "Drop CSV file or click to upload"}
              </div>
            </div>

            <button
              onClick={handleBatchScan}
              disabled={batchScanning || (!batchText.trim() && !csvFile)}
              style={{
                marginTop: 14, background: "#a78bfa", color: "#030712", border: "none",
                borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", opacity: batchScanning || (!batchText.trim() && !csvFile) ? 0.5 : 1,
              }}
            >
              {batchScanning ? `Scanning... ${batchProgress}%` : "Start batch scan"}
            </button>
            {batchStatus && <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 13 }}>{batchStatus}</div>}
          </div>
        )}

        {/* footer note */}
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid #0f172a", color: "#334155", fontSize: 12 }}>
          Model: LightGBM trained on Blur Season 2. Research:{" "}
          <a href="https://github.com/Tyche1107/pre-airdrop-detection" target="_blank" rel="noreferrer" style={{ color: "#475569" }}>
            github.com/Tyche1107/pre-airdrop-detection
          </a>
        </div>
      </main>
    </div>
  );
}
