"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ApiKeysPage() {
  const [protocolName, setProtocolName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!protocolName.trim()) return;
    setIsLoading(true);
    setError("");
    setGeneratedKey("");
    setCopied(false);

    try {
      const res = await fetch(`${API_URL}/v1/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: protocolName.trim() }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const key = data.key || data.api_key || data.token || JSON.stringify(data);
      setGeneratedKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate key.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = generatedKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#e2e8f0", marginBottom: "8px" }}>
        API Keys
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "32px" }}>
        Generate an API key to authenticate requests to SybilScan.
      </p>

      <div
        style={{
          background: "#1a202c",
          border: "1px solid #2d3748",
          borderRadius: "12px",
          padding: "28px",
        }}
      >
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              color: "#94a3b8",
              marginBottom: "8px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Protocol name
          </label>
          <input
            type="text"
            value={protocolName}
            onChange={(e) => setProtocolName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && protocolName.trim() && handleGenerate()}
            placeholder="e.g. My Protocol"
            style={{
              width: "100%",
              background: "#0f1117",
              border: "1px solid #2d3748",
              borderRadius: "7px",
              color: "#e2e8f0",
              fontSize: "14px",
              padding: "10px 14px",
              outline: "none",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "6px",
              color: "#ef4444",
              fontSize: "14px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!protocolName.trim() || isLoading}
          style={{
            width: "100%",
            padding: "11px",
            background:
              !protocolName.trim() || isLoading ? "#4c3d8f" : "#8b5cf6",
            color: !protocolName.trim() || isLoading ? "#9d86d8" : "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: !protocolName.trim() || isLoading ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {isLoading ? "Generating..." : "Generate Key"}
        </button>

        {generatedKey && (
          <div style={{ marginTop: "28px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>
                Your API Key
              </span>
              <button
                onClick={handleCopy}
                style={{
                  padding: "4px 12px",
                  background: copied
                    ? "rgba(34,197,94,0.15)"
                    : "rgba(139,92,246,0.15)",
                  color: copied ? "#22c55e" : "#8b5cf6",
                  border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(139,92,246,0.3)"}`,
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div
              style={{
                background: "#0f1117",
                border: "1px solid #2d3748",
                borderRadius: "8px",
                padding: "16px",
                fontFamily: "monospace",
                fontSize: "13px",
                color: "#22c55e",
                wordBreak: "break-all",
                lineHeight: 1.6,
              }}
            >
              {generatedKey}
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                background: "rgba(234,179,8,0.08)",
                border: "1px solid rgba(234,179,8,0.2)",
                borderRadius: "7px",
                fontSize: "13px",
                color: "#eab308",
              }}
            >
              Store this key securely. It will not be shown again.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
