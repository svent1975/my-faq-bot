// app/api/stripe-webhook/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: Request): Promise<Response> {
  try {
    // In test mode on Vercel, you can skip signature checking at first,
    // then add it later with STRIPE_WEBHOOK_SECRET.
    const raw = await req.text(); // raw body
    const event = JSON.parse(raw); // simple parse for now

    // You can handle many events; start with checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // TODO: Look up your user (by email or your own user id)
      // and mark subscription active in your DB (e.g., Supabase)
      // Example fields you might save: stripeCustomerId, plan, status = 'active'
      console.log("[webhook] subscription active for session:", session.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("webhook error:", err.message || err);
    return new Response(JSON.stringify({ error: "Webhook error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
