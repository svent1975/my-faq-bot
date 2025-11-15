// app/api/checkout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";

/** Create a single Stripe instance (no apiVersion pin to avoid TS literal mismatch) */
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY in env");
  // Do NOT pass apiVersion — let the SDK use its default for your installed version
  return new Stripe(key);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const stripe = getStripe();
    const { priceId } = (await req.json()) as { priceId?: string };

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Missing priceId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create a Checkout Session for a subscription
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      // Let Stripe collect the email on the checkout page
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checkout] POST error:", message);
    return new Response(JSON.stringify({ error: "Checkout failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Optional: GET so visiting /api/checkout returns 200 instead of 405 */
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, method: "GET" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
