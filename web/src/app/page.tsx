"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = "";

type Tab = "single" | "batch";
type Risk = "high" | "medium" | "low" | "unknown" | "error";
type Lang = "en" | "zh";
type Chain = "eth" | "arb" | "poly" | "base" | "op" | "bsc";

const CHAINS: { id: Chain; label: string; name: string; soon?: boolean }[] = [
  { id: "eth",  label: "ETH",  name: "Ethereum" },
  { id: "arb",  label: "ARB",  name: "Arbitrum" },
  { id: "poly", label: "POLY", name: "Polygon" },
  { id: "base", label: "BASE", name: "Base",     soon: true },
  { id: "op",   label: "OP",   name: "Optimism", soon: true },
  { id: "bsc",  label: "BSC",  name: "BNB Chain",soon: true },
];

interface TopFeature {
  feature: string;
  label: string;
  value: number;
  contribution: number;
}

interface VerifyResult {
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
  error?: string;
  lgb_score?: number;
  if_score?: number;
  top_features?: TopFeature[];
}

const RISK_COLOR: Record<Risk, string> = {
  high:    "#ef4444",
  medium:  "#f59e0b",
  low:     "#22c55e",
  unknown: "#6b7280",
  error:   "#ef4444",
};

// Theme
type Theme = {
  bg: string; bg2: string; bg3: string;
  border: string; border2: string;
  text: string; text2: string; text3: string; text4: string;
  accent: string;
};

const DARK: Theme = {
  bg: "#030712", bg2: "#0f172a", bg3: "#1e293b",
  border: "#0f172a", border2: "#1e293b",
  text: "#f8fafc", text2: "#e2e8f0", text3: "#94a3b8", text4: "#475569",
  accent: "#a78bfa",
};
const LIGHT: Theme = {
  bg: "#f8fafc", bg2: "#ffffff", bg3: "#f1f5f9",
  border: "#e2e8f0", border2: "#e2e8f0",
  text: "#0f172a", text2: "#1e293b", text3: "#475569", text4: "#94a3b8",
  accent: "#7c3aed",
};

// Translations
const T = {
  en: {
    nav_results: "Results", nav_research: "Research", nav_mindmap: "MINDMAP",
    hero_tag: "Pre-Airdrop Sybil Detection",
    hero_h1: ["Score any address", "before the airdrop drops"],
    hero_desc: "LightGBM trained on Blur Season 2. 53K recipients, 9,817 sybil addresses. AUC 0.793 at T-30 vs ARTEMIS post-hoc GNN 0.803. Validated on LayerZero (AUC 0.946).",
    stats: [["AUC 0.793","Blur T-30"],["AUC 0.946","LayerZero"],["T-180","Signal stable"],["67%","Evasion cost"]],
    tab_single: "Single address", tab_batch: "Batch scan",
    placeholder_single: "0x... Ethereum address",
    btn_scan: "Scan", btn_scanning: "Scanning...",
    scanning_hint: "Fetching on-chain data... (known: instant, new: ~10s)",
    btn_batch: "Start batch scan", btn_batching: "Scanning...",
    batch_placeholder: "0xabc123...\n0xdef456...\nOne address per line (max 50,000)",
    drop_hint: "Drop CSV or click to upload",
    risk_high: "HIGH RISK", risk_medium: "MEDIUM RISK", risk_low: "LOW RISK",
    risk_unknown: "UNKNOWN", risk_error: "ERROR",
    sybil_prob: "Sybil probability",
    fields: [["Transactions",""],["Wallet age",""],["NFT collections",""],["Unique contracts",""],["Volume",""],["Sybil type",""]],
    lgb_label: "LightGBM score", if_label: "Isolation Forest score", src_label: "Data source",
    src_live: "live (Etherscan)", src_cached: "cached (Blur dataset)",
    footer: "Model: LightGBM on Blur Season 2. Research: ",
    chain_label: (name: string) => `Chain: ${name}`,
    top_signals: "Top signals",
    contributes: "contributes",
  },
  zh: {
    nav_results: "结果", nav_research: "论文", nav_mindmap: "实验图",
    hero_tag: "空投前女巫检测",
    hero_h1: ["地址评分", "在空投发放前"],
    hero_desc: "LightGBM 训练于 Blur Season 2，53K 空投用户，9,817 女巫地址。T-30 AUC 0.793，接近事后 GNN ARTEMIS（0.803）。LayerZero 验证 AUC 0.946。",
    stats: [["AUC 0.793","Blur T-30"],["AUC 0.946","LayerZero"],["T-180","信号稳定"],["67%","逃避成本"]],
    tab_single: "单地址", tab_batch: "批量扫描",
    placeholder_single: "0x... 以太坊地址",
    btn_scan: "扫描", btn_scanning: "扫描中...",
    scanning_hint: "获取链上数据中...（已知地址：即时，新地址：约 10s）",
    btn_batch: "开始批量扫描", btn_batching: "扫描中...",
    batch_placeholder: "0xabc123...\n0xdef456...\n每行一个地址（最多 50,000）",
    drop_hint: "拖入 CSV 文件或点击上传",
    risk_high: "高风险", risk_medium: "中风险", risk_low: "低风险",
    risk_unknown: "未知", risk_error: "错误",
    sybil_prob: "女巫概率",
    fields: [["交易次数",""],["钱包年龄",""],["NFT 集合",""],["合约交互",""],["交易量",""],["女巫类型",""]],
    lgb_label: "LightGBM 评分", if_label: "Isolation Forest 评分", src_label: "数据来源",
    src_live: "实时 (Etherscan)", src_cached: "缓存 (Blur 数据集)",
    footer: "模型：LightGBM，Blur Season 2 训练。研究：",
    chain_label: (name: string) => `当前链：${name}`,
    top_signals: "关键信号",
    contributes: "贡献",
  },
};

function ScoreBar({ score, sybilScore, t, theme }: { score: number; sybilScore?: number; t: typeof T.en; theme: Theme }) {
  const pct = sybilScore ?? Math.round(score * 100);
  const color = pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: theme.text4 }}>{t.sybil_prob}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: theme.bg3, borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function ResultCard({ result, t, theme }: { result: VerifyResult; t: typeof T.en; theme: Theme }) {
  if (!result) return null;
  const riskColor = RISK_COLOR[result.risk] || "#6b7280";
  const src = result.data_source;
  const riskLabel = result.risk === "high" ? t.risk_high : result.risk === "medium" ? t.risk_medium :
    result.risk === "low" ? t.risk_low : result.risk === "error" ? t.risk_error : t.risk_unknown;

  return (
    <div style={{
      background: theme.bg2, border: `1px solid ${riskColor}40`, borderRadius: 12,
      padding: "20px 24px", marginTop: 20, maxWidth: 560,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: theme.text4, fontFamily: "monospace", marginBottom: 4 }}>
            {result.address}
          </div>
          <div style={{
            display: "inline-block", background: `${riskColor}20`,
            color: riskColor, fontSize: 11, fontWeight: 700,
            padding: "2px 10px", borderRadius: 4, letterSpacing: 1,
          }}>
            {riskLabel}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: riskColor, lineHeight: 1 }}>
            {result.sybil_score ?? (result.score != null ? Math.round(result.score * 100) : "--")}
            <span style={{ fontSize: 14, fontWeight: 400, color: theme.text4, marginLeft: 4 }}>/100</span>
          </div>
        </div>
      </div>

      {result.score != null && <ScoreBar score={result.score} sybilScore={result.sybil_score} t={t} theme={theme} />}

      {result.error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{result.error}</div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border2}`,
      }}>
        {t.fields.map(([label], i) => {
          const vals = [
            result.tx_count ?? "--",
            result.wallet_age_days != null ? `${Math.round(result.wallet_age_days)}d` : "--",
            result.nft_collections ?? "--",
            result.unique_contracts ?? "--",
            result.total_volume_eth != null ? `${result.total_volume_eth.toFixed(3)} ETH` : "--",
            result.sybil_type ?? "--",
          ];
          return (
            <div key={label as string}>
              <div style={{ fontSize: 10, color: theme.text4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, color: theme.text2, fontWeight: 500 }}>{String(vals[i])}</div>
            </div>
          );
        })}
      </div>

      {result.top_features && result.top_features.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border2}` }}>
          <div style={{ fontSize: 10, color: theme.text4, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            {t.top_signals}
          </div>
          {result.top_features.map(f => {
            const isPositive = f.contribution > 0;
            const barColor = isPositive ? "#ef4444" : "#22c55e";
            const pct = Math.min(Math.abs(f.contribution) * 200, 100);
            return (
              <div key={f.feature} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: theme.text3 }}>{f.label}</span>
                  <span style={{ fontSize: 11, color: theme.text4 }}>
                    {f.value.toFixed(2)} &nbsp;
                    <span style={{ color: isPositive ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                      {isPositive ? "+" : ""}{(f.contribution * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div style={{ background: theme.bg3, borderRadius: 3, height: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.lgb_score != null && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border2}`, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: theme.text4 }}>{t.lgb_label}</div>
            <div style={{ fontSize: 12, color: theme.text3 }}>{(result.lgb_score * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.text4 }}>{t.if_label}</div>
            <div style={{ fontSize: 12, color: theme.text3 }}>{(result.if_score! * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.text4 }}>{t.src_label}</div>
            <div style={{ fontSize: 12, color: src === "live" ? theme.accent : theme.text3 }}>
              {src === "live" ? t.src_live : src === "cached" ? t.src_cached : src}
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
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [chain, setChain] = useState<Chain>("eth");

  const theme = isDark ? DARK : LIGHT;
  const t = T[lang];

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
      const res = await fetch(`/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, chain }),
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
    if (batchText.trim()) return batchText.split("\n").map(a => a.trim()).filter(Boolean);
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
      const res = await fetch(`/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: addrs, chain }),
      });
      const { job_id } = await res.json();
      setBatchStatus("Processing...");
      const poll = setInterval(async () => {
        const jr = await fetch(`/api/jobs/${job_id}`);
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

  const btnStyle = (active: boolean) => ({
    padding: "7px 20px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600 as const,
    background: active ? theme.bg3 : "transparent",
    color: active ? theme.text : theme.text4,
    transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "system-ui, sans-serif", transition: "background 0.2s, color 0.2s" }}>
      {/* nav */}
      <nav style={{ borderBottom: `1px solid ${theme.border}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.5 }}>SybilScan</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
          <a href="/results" style={{ color: theme.text4, textDecoration: "none" }}>{t.nav_results}</a>
          <a href="https://github.com/Tyche1107/pre-airdrop-detection" target="_blank" rel="noreferrer" style={{ color: theme.text4, textDecoration: "none" }}>{t.nav_research}</a>
          <a href="https://tyche1107.github.io/pre-airdrop-detection/MINDMAP.html" target="_blank" rel="noreferrer" style={{ color: theme.text4, textDecoration: "none" }}>{t.nav_mindmap}</a>
          {/* language toggle */}
          <button onClick={() => setLang(l => l === "en" ? "zh" : "en")} style={{
            background: theme.bg3, border: `1px solid ${theme.border2}`, borderRadius: 6,
            padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: theme.text3,
          }}>
            {lang === "en" ? "中文" : "EN"}
          </button>
          {/* dark/light toggle */}
          <button onClick={() => setIsDark(d => !d)} style={{
            background: theme.bg3, border: `1px solid ${theme.border2}`, borderRadius: 6,
            padding: "4px 10px", fontSize: 12, cursor: "pointer", color: theme.text3,
          }}>
            {isDark ? "☀" : "◑"}
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "64px 24px" }}>
        {/* hero */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: theme.accent, textTransform: "uppercase", marginBottom: 12 }}>
            {t.hero_tag}
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0, lineHeight: 1.1, color: theme.text }}>
            {t.hero_h1[0]}<br />{t.hero_h1[1]}
          </h1>
          <p style={{ color: theme.text4, marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: 520 }}>
            {t.hero_desc}
          </p>
          <div style={{ marginTop: 8, fontSize: 12, color: theme.text4 }}>
            {t.chain_label(CHAINS.find(c => c.id === chain)?.name ?? chain.toUpperCase())}
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
            {t.stats.map(([val, label]) => (
              <div key={val} style={{ background: theme.bg2, border: `1px solid ${theme.border2}`, borderRadius: 8, padding: "8px 14px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.accent }}>{val}</div>
                <div style={{ fontSize: 11, color: theme.text4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 2, background: theme.bg2, borderRadius: 8, padding: 4, marginBottom: 24, width: "fit-content", border: `1px solid ${theme.border2}` }}>
          <button onClick={() => setTab("single")} style={btnStyle(tab === "single")}>{t.tab_single}</button>
          <button onClick={() => setTab("batch")} style={btnStyle(tab === "batch")}>{t.tab_batch}</button>
        </div>

        {/* chain selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {CHAINS.map(c => (
            <button
              key={c.id}
              onClick={() => !c.soon && setChain(c.id)}
              title={c.soon ? "Coming soon (paid tier)" : c.name}
              style={{
                position: "relative", padding: "5px 14px", borderRadius: 20,
                border: `1px solid ${chain === c.id ? theme.accent : theme.border2}`,
                background: chain === c.id ? `${theme.accent}15` : "transparent",
                color: chain === c.id ? theme.accent : c.soon ? theme.text4 : theme.text3,
                fontSize: 12, fontWeight: 600,
                cursor: c.soon ? "default" : "pointer",
                opacity: c.soon ? 0.45 : 1,
                transition: "all 0.15s",
              }}
            >
              {c.label}
              {c.soon && (
                <span style={{
                  position: "absolute", top: -7, right: -4,
                  fontSize: 8, background: theme.bg3, color: theme.text4,
                  padding: "1px 4px", borderRadius: 3, fontWeight: 700,
                  border: `1px solid ${theme.border2}`,
                }}>SOON</span>
              )}
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
                placeholder={t.placeholder_single}
                style={{
                  flex: 1, background: theme.bg2, border: `1px solid ${theme.border2}`, borderRadius: 8,
                  padding: "12px 16px", color: theme.text, fontSize: 14, fontFamily: "monospace", outline: "none",
                }}
              />
              <button onClick={handleSingleScan} disabled={scanning || !singleAddr.trim()} style={{
                background: theme.accent, color: isDark ? "#030712" : "#ffffff", border: "none", borderRadius: 8,
                padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                opacity: scanning || !singleAddr.trim() ? 0.5 : 1, whiteSpace: "nowrap",
              }}>
                {scanning ? t.btn_scanning : t.btn_scan}
              </button>
            </div>
            {scanning && <div style={{ marginTop: 16, color: theme.accent, fontSize: 13 }}>{t.scanning_hint}</div>}
            {singleError && <div style={{ color: "#ef4444", marginTop: 12, fontSize: 13 }}>{singleError}</div>}
            {singleResult && <ResultCard result={singleResult} t={t} theme={theme} />}
          </div>
        )}

        {/* batch panel */}
        {tab === "batch" && (
          <div>
            <textarea
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              placeholder={t.batch_placeholder}
              rows={6}
              style={{
                width: "100%", background: theme.bg2, border: `1px solid ${theme.border2}`, borderRadius: 8,
                padding: "14px 16px", color: theme.text, fontSize: 13, fontFamily: "monospace",
                outline: "none", resize: "vertical", boxSizing: "border-box",
              }}
            />
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
                marginTop: 10, border: `1px dashed ${isDragging ? theme.accent : theme.border2}`,
                borderRadius: 8, padding: 20, textAlign: "center", cursor: "pointer",
                background: isDragging ? `${theme.accent}10` : "transparent", transition: "all 0.15s",
              }}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { setCsvFile(f); setBatchText(""); } }} />
              <div style={{ color: theme.text4, fontSize: 13 }}>
                {csvFile ? csvFile.name : t.drop_hint}
              </div>
            </div>
            <button
              onClick={handleBatchScan}
              disabled={batchScanning || (!batchText.trim() && !csvFile)}
              style={{
                marginTop: 14, background: theme.accent, color: isDark ? "#030712" : "#ffffff",
                border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 700,
                cursor: "pointer", opacity: batchScanning || (!batchText.trim() && !csvFile) ? 0.5 : 1,
              }}
            >
              {batchScanning ? `${t.btn_batching} ${batchProgress}%` : t.btn_batch}
            </button>
            {batchStatus && <div style={{ marginTop: 10, color: theme.text3, fontSize: 13 }}>{batchStatus}</div>}
          </div>
        )}

        <div style={{ marginTop: 60, paddingTop: 24, borderTop: `1px solid ${theme.border}`, color: theme.text4, fontSize: 12 }}>
          {t.footer}
          <a href="https://github.com/Tyche1107/pre-airdrop-detection" target="_blank" rel="noreferrer" style={{ color: theme.text3 }}>
            github.com/Tyche1107/pre-airdrop-detection
          </a>
        </div>
      </main>
    </div>
  );
}
