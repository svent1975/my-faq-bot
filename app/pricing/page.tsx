"use client";
import { useState } from "react";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  // Replace these with the actual price IDs from your Stripe dashboard (Products → Prices)
  const PLANS = [
    { name: "Starter", priceId: "price_1SOjv9CHPcA4XSFOyxRSQn6l", price: "$29 / mo" },
    { name: "Growth",  priceId: "price_1SOykiCHPcA4XSFOtOrg0uVm", price: "$79 / mo" },
    { name: "Pro",     priceId: "price_1SOyl4CHPcA4XSFONbtpBwwS", price: "$149 / mo" },
  ];

  async function goCheckout(priceId: string) {
    try {
      setLoading(priceId);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // send user to Stripe Checkout
      } else {
        alert("Could not start checkout.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={{display:"grid",placeItems:"center",minHeight:"100vh"}}>
      <div style={{display:"grid",gap:16}}>
        <h1>Choose a plan</h1>
        {PLANS.map(p => (
          <button key={p.priceId} onClick={() => goCheckout(p.priceId)} disabled={loading===p.priceId}>
            {loading===p.priceId ? "Redirecting..." : `Buy ${p.name} – ${p.price}`}
          </button>
        ))}
        <p style={{fontSize:12,opacity:.7}}>Test card: 4242 4242 4242 4242 · Any future date · Any CVC</p>
      </div>
    </main>
  );
}
