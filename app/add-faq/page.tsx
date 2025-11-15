"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AddFAQ() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { data, error } = await supabase
      .from("faqs")
      .insert([{ question, answer }]);

    if (error) {
      setMessage("❌ Error: " + error.message);
    } else {
      setMessage("✅ FAQ saved!");
      setQuestion("");
      setAnswer("");
    }
  }

  return (
    <main style={{display:"grid",placeItems:"center",minHeight:"100vh"}}>
      <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",width:"300px",gap:"10px"}}>
        <input
          type="text"
          placeholder="Enter a question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
        <textarea
          placeholder="Enter an answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
        />
        <button type="submit">Save FAQ</button>
        <p>{message}</p>
      </form>
    </main>
  );
}