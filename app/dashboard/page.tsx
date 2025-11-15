// app/dashboard/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Faq = { id: string; question: string; answer: string }

export default function Dashboard() {
  const [session, setSession] = useState<any>(null)
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [ask, setAsk] = useState('')
  const [reply, setReply] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    load()
  }, [session])

  async function signIn() {
    const email = prompt('Enter your email to sign in (magic link):')
    if (!email) return
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) alert(error.message)
    else alert('Check your email for the login link.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setFaqs([])
  }

  async function load() {
    const { data, error } = await supabase
      .from('faqs')
      .select('id, question, answer')
      .order('created_at', { ascending: false })
    if (!error && data) setFaqs(data as Faq[])
  }

  async function addFaq(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user) return alert('Please sign in first.')
    const { error } = await supabase.from('faqs').insert({
      question: q,
      answer: a,
      created_by: session.user.id, // RLS requires this!
    } as any)
    if (error) return alert(error.message)
    setQ(''); setA(''); load()
  }

  async function del(id: string) {
    const { error } = await supabase.from('faqs').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  async function askServer() {
    if (!ask.trim()) return
    setReply('Thinking…')
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: ask })
    })
    const j = await r.json()
    setReply(j.reply ?? j.error ?? 'No reply')
  }

  return (
    <main className="container mx-auto px-6 py-10 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {session?.user ? (
          <button className="border px-3 py-1 rounded" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <button className="border px-3 py-1 rounded" onClick={signIn}>
            Sign in
          </button>
        )}
      </div>

      {session?.user ? (
        <>
          <form onSubmit={addFaq} className="flex flex-col gap-2 max-w-xl">
            <input className="border p-2 rounded" placeholder="Question" value={q} onChange={e=>setQ(e.target.value)} required />
            <textarea className="border p-2 rounded" placeholder="Answer" value={a} onChange={e=>setA(e.target.value)} required />
            <button className="border px-3 py-2 rounded">Add FAQ</button>
          </form>

          <section>
            <h2 className="font-semibold mb-2">Your FAQs</h2>
            <ul className="space-y-2">
              {faqs.map(f => (
                <li key={f.id} className="border rounded p-3">
                  <div className="font-medium">Q: {f.question}</div>
                  <div>A: {f.answer}</div>
                  <button className="mt-2 text-sm underline" onClick={()=>del(f.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="max-w-xl">
            <h2 className="font-semibold mb-2">Ask</h2>
            <input className="border p-2 rounded w-full" placeholder="Type a question" value={ask} onChange={e=>setAsk(e.target.value)} />
            <button className="border px-3 py-2 rounded mt-2" onClick={askServer}>Ask</button>
            {reply && <p className="mt-2 whitespace-pre-wrap">{reply}</p>}
          </section>
        </>
      ) : (
        <p>Sign in to add FAQs and ask questions.</p>
      )}
    </main>
  )
}
