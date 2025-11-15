// app/api/ask/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseServer } from "../../../lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { question } = await req.json()
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 })

    const supabase = await supabaseServer();

    // pull only THIS user's FAQs (RLS ensures it)
    const { data: faqs, error } = await supabase
      .from('faqs')
      .select('question, answer')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw new Error(error.message)

    const context = (faqs ?? [])
      .map((f: any) => `Q: ${f.question}\nA: ${f.answer}`)
      .join('\n\n') || '(no FAQs)'

    const messages = [
      { role: 'system', content: 'Answer using only the FAQ context. If unsure, say you do not know.' },
      { role: 'user', content: `Question: ${question}\n\nFAQ:\n${context}` }
    ]

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, messages })
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error?.message || 'OpenAI error')

    const reply = j?.choices?.[0]?.message?.content ?? "I don't know."
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
