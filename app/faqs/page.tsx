import { supabase } from "@/lib/supabaseClient";

export default async function FAQsPage() {
  const { data: faqs, error } = await supabase.from("faqs").select("*");

  if (error) return <p>Error: {error.message}</p>;
  if (!faqs?.length) return <p>No FAQs yet.</p>;

  return (
    <main style={{padding:"40px"}}>
      <h1>Saved FAQs</h1>
      <ul>
        {faqs.map((f) => (
          <li key={f.id}>
            <strong>{f.question}</strong><br />
            {f.answer}
          </li>
        ))}
      </ul>
    </main>
  );
}