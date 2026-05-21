import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setError(null);
    setSvg(null);
    try {
      const result = await invoke<string>("test");
      setSvg(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      {/* <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          paddingTop: "56.25%",
        }}
      >
        <iframe
          onLoad={(e) => {
            console.log(e.currentTarget);
            console.log(
              (
                e.currentTarget.contentDocument ||
                e.currentTarget.contentWindow?.document
              )?.querySelector("input#tel"),
            );
          }}
          style={{
            resize: "both",
            overflow: "auto",
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
          }}
          src="https://portal.example.com/team/"
        />
      </div> */}
      <button
        style={{ marginTop: "16px" }}
        onClick={runTest}
        disabled={loading}
      >
        {loading ? "Loading…" : "Test"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {svg && (
        <div className="svg-result" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </main>
  );
}

export default App;
