"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Tab = "paste" | "upload";
type JobStatus = "pending" | "running" | "completed" | "failed";

interface JobResponse {
  status: JobStatus;
  progress?: number;
  error?: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("paste");
  const [addresses, setAddresses] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV to get addresses
  const parseCsvAddresses = useCallback((text: string): string[] => {
    const lines = text.split("\n").map((l) => l.trim());
    const header = lines[0]?.toLowerCase().split(",") ?? [];
    const addrIdx = header.findIndex((h) => h.includes("address"));
    if (addrIdx === -1) {
      // Assume first column
      return lines.slice(1).map((l) => l.split(",")[0]?.trim()).filter(Boolean);
    }
    return lines
      .slice(1)
      .map((l) => l.split(",")[addrIdx]?.trim())
      .filter(Boolean);
  }, []);

  const getParsedAddresses = useCallback(async (): Promise<string[]> => {
    if (tab === "paste") {
      return addresses
        .split("\n")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    } else if (csvFile) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          resolve(parseCsvAddresses(text));
        };
        reader.readAsText(csvFile);
      });
    }
    return [];
  }, [tab, addresses, csvFile, parseCsvAddresses]);

  const isEmpty =
    tab === "paste"
      ? addresses.trim().length === 0
      : csvFile === null;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      setCsvFile(file);
    }
  }, []);

  const handleScan = async () => {
    setError("");
    setIsScanning(true);
    setProgress(0);
    setStatusText("Submitting addresses...");

    try {
      const parsed = await getParsedAddresses();
      if (parsed.length === 0) {
        setError("No valid addresses found.");
        setIsScanning(false);
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.trim()) {
        headers["X-API-Key"] = apiKey.trim();
      }

      const res = await fetch(`${API_URL}/v1/score`, {
        method: "POST",
        headers,
        body: JSON.stringify({ addresses: parsed }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const jobId: string = data.job_id;

      setStatusText("Scanning...");

      // Poll for job completion
      const pollInterval = setInterval(async () => {
        try {
          const jobRes = await fetch(`${API_URL}/v1/jobs/${jobId}`, {
            headers: apiKey.trim() ? { "X-API-Key": apiKey.trim() } : {},
          });
          if (!jobRes.ok) return;

          const job: JobResponse = await jobRes.json();

          if (typeof job.progress === "number") {
            setProgress(job.progress * 100);
          }

          if (job.status === "completed") {
            clearInterval(pollInterval);
            setProgress(100);
            setStatusText("Complete!");
            setTimeout(() => {
              router.push(`/results?job_id=${jobId}`);
            }, 300);
          } else if (job.status === "failed") {
            clearInterval(pollInterval);
            setError(job.error || "Scan failed. Please try again.");
            setIsScanning(false);
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setIsScanning(false);
    }
  };

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "36px",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0, color: "#e2e8f0" }}>
          SybilScan
        </h1>
        <span style={{ fontSize: "14px", color: "#94a3b8" }}>
          Pre-airdrop sybil detection
        </span>
      </div>

      {/* Card */}
      <div
        style={{
          background: "#1a202c",
          border: "1px solid #2d3748",
          borderRadius: "12px",
          padding: "28px",
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "24px",
            background: "#0f1117",
            borderRadius: "8px",
            padding: "4px",
          }}
        >
          {(["paste", "upload"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
                background: tab === t ? "#1a202c" : "transparent",
                color: tab === t ? "#e2e8f0" : "#94a3b8",
                transition: "all 0.15s",
              }}
            >
              {t === "paste" ? "Paste Addresses" : "Upload CSV"}
            </button>
          ))}
        </div>

        {/* Paste Tab */}
        {tab === "paste" && (
          <textarea
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            placeholder={"0x742d35Cc...\n0x8ba1f109...\nOne address per line"}
            style={{
              width: "100%",
              height: "220px",
              background: "#0f1117",
              border: "1px solid #2d3748",
              borderRadius: "8px",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: "13px",
              padding: "14px",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.6,
            }}
          />
        )}

        {/* Upload Tab */}
        {tab === "upload" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              height: "220px",
              border: `2px dashed ${isDragging ? "#8b5cf6" : "#2d3748"}`,
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: isDragging ? "rgba(139,92,246,0.05)" : "#0f1117",
              transition: "all 0.15s",
              gap: "12px",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setCsvFile(f);
              }}
            />
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {csvFile ? (
              <span style={{ color: "#22c55e", fontSize: "14px", fontWeight: 500 }}>
                {csvFile.name}
              </span>
            ) : (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#e2e8f0", fontSize: "15px" }}>
                  Drop CSV file here or click to browse
                </div>
                <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
                  Accepts .csv with a column named &ldquo;address&rdquo;
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Key */}
        <div style={{ marginTop: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>
            API Key (optional)
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{
              width: "100%",
              background: "#0f1117",
              border: "1px solid #2d3748",
              borderRadius: "6px",
              color: "#e2e8f0",
              fontSize: "13px",
              padding: "8px 12px",
              outline: "none",
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "6px",
              color: "#ef4444",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Progress Bar */}
        {isScanning && (
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              <span>{statusText}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div
              style={{
                height: "6px",
                background: "#0f1117",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "#8b5cf6",
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleScan}
          disabled={isEmpty || isScanning}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "12px",
            background: isEmpty || isScanning ? "#4c3d8f" : "#8b5cf6",
            color: isEmpty || isScanning ? "#9d86d8" : "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: isEmpty || isScanning ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {isScanning ? "Scanning..." : "Scan Addresses"}
        </button>
      </div>
    </div>
  );
}
