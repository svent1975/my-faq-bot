// app/api/chat/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabaseClient";

// --- CORS (so the widget on customer sites can call this) ---
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
export async function GET() {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// --- Helpers ---
async function readJson<T = any>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

async function getEmbeddingFor(text: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Embedding failed");
  return j.data[0].embedding;
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function callOpenAI(messages: ChatMsg[]): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.2 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "OpenAI failed");
  return (j?.choices?.[0]?.message?.content || "").trim();
}

// --- Main POST ---
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson<{ question?: string; tenantId?: string }>(req);
    const question = (body?.question || "").trim();
    const tenantId = (body?.tenantId || "").trim();

    if (!question) {
      return new Response(JSON.stringify({ reply: "Please provide a question." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    if (!tenantId) {
      return new Response(JSON.stringify({ reply: "Missing tenantId." }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // 1) Load FAQs for the tenant
    const { data: faqs, error: faqErr } = await supabase
      .from("faqs")
      .select("question,answer")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (faqErr) console.error("[chat] faqs error:", faqErr.message);

    const faqContext =
      (faqs ?? [])
        .map((f: any) => `Q: ${f.question}\nA: ${f.answer}`)
        .join("\n---\n");

    // 2) Vector search: top K website chunks
    let websiteContext = "";
    try {
      const queryEmbedding = await getEmbeddingFor(question);
      const { data: matches } = await supabase.rpc("match_page_chunks", {
        query_embedding: queryEmbedding,
        match_count: 5,
        tenant: tenantId,
      });
      websiteContext = (matches ?? [])
        .map((m: any) => `Source: ${m.url}\n${m.content}`)
        .join("\n---\n");
    } catch (e: any) {
      console.warn("[chat] vector search skipped:", e?.message || e);
    }

    // 3) Build a single prompt that prefers FAQs, then website
    const system = [
      "You are a helpful support bot for this business.",
      "Answer concisely.",
      "Prefer using the FAQ answers below.",
      "If not found in FAQs, use the WEBSITE EXCERPTS.",
      'If still unsure, say: "I\'m not sure, please contact support."',
      "",
      "FAQ ANSWERS:",
      faqContext || "(no FAQs yet)",
      "",
      "WEBSITE EXCERPTS:",
      websiteContext || "(no website content indexed yet)",
    ].join("\n");

    const messages: ChatMsg[] = [
      { role: "system", content: system },
      { role: "user", content: question },
    ];

    const reply = await callOpenAI(messages);
    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (e: any) {
    console.error("[chat] error:", e?.message || e);
    return new Response(JSON.stringify({ reply: "An error occurred." }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}
