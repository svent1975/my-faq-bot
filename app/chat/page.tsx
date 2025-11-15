"use client";
import { useState } from "react";

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAsk() {
    setLoading(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setAnswer(data.reply);
    setLoading(false);
  }

  return (
    <main style={{display:"grid",placeItems:"center",minHeight:"100vh"}}>
      <div style={{width:"400px"}}>
        <h2>Ask our FAQ Bot</h2>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Type your question..."
          style={{width:"100%",padding:"10px"}}
        />
        <button onClick={handleAsk} disabled={loading} style={{marginTop:"10px"}}>
          {loading ? "Thinking..." : "Ask"}
        </button>
        {answer && (
          <p style={{marginTop:"20px",background:"#f1f1f1",padding:"10px"}}>
            <strong>Answer:</strong> {answer}
          </p>
        )}
      </div>
    </main>
  );
}