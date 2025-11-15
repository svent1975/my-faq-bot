// app/api/import-sitemap/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST (two ways):
 *  A) JSON: { tenantId: string, sitemapUrl: string, maxPages?: number }
 *  B) multipart/form-data: fields tenantId, maxPages? + file input named "file" (sitemap.xml)
 *
 * Flow:
 *  - Parse sitemap (supports <urlset> and <sitemapindex>)
 *  - Collect internal URLs, cap by maxPages
 *  - Fetch each page, clean text, chunk, embed, store in Supabase (page_chunks)
 */

import { supabase } from "@/lib/supabaseClient";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

// ---------- Config ----------
const DEFAULT_MAX_PAGES = 50;          // safety cap
const FETCH_TIMEOUT_MS = 15000;        // 15s per page
const USER_AGENT =
  "FAQBot/1.0 (+contact: support@yourapp.example)";

// ---------- Helpers ----------
function chunkText(text: string, size = 800, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + size).join(" ");
    if (slice.trim()) chunks.push(slice);
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

function extractText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,iframe,svg,canvas").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function safeFetch(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.text();
  } catch (e: any) {
    console.error("[import-sitemap] fetch error:", url, e?.message || e);
    return "";
  }
}

async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Embedding failed");
  return j.data.map((d: any) => d.embedding);
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function collectFromUrlset(obj: any): string[] {
  // urlset.url can be object or array; loc can be string or object
  const urls = obj?.urlset?.url;
  if (!urls) return [];
  const arr = Array.isArray(urls) ? urls : [urls];
  return arr
    .map((u: any) => (typeof u?.loc === "string" ? u.loc : u?.loc?.["#text"] || ""))
    .filter(Boolean);
}

function collectFromSitemapIndex(obj: any): string[] {
  const sitemaps = obj?.sitemapindex?.sitemap;
  if (!sitemaps) return [];
  const arr = Array.isArray(sitemaps) ? sitemaps : [sitemaps];
  return arr
    .map((s: any) => (typeof s?.loc === "string" ? s.loc : s?.loc?.["#text"] || ""))
    .filter(Boolean);
}

async function parseSitemapXml(xml: string): Promise<{ urls: string[]; nestedSitemaps: string[] }> {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true, trimValues: true });
  const obj = parser.parse(xml);
  const urls = collectFromUrlset(obj);
  const nested = collectFromSitemapIndex(obj);
  return { urls, nestedSitemaps: nested };
}

async function readMultipart(req: Request): Promise<{ fields: Record<string, string>, fileXml?: string }> {
  const form = await req.formData();
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }
  const file = form.get("file");
  let fileXml: string | undefined;
  if (file && file instanceof File) {
    fileXml = await file.text();
  }
  return { fields, fileXml };
}

async function readJson<T = any>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

// Optional: Check active subscription for tenant
async function assertActiveSubscription(tenantId: string): Promise<void> {
  // Minimal no-op starter; wire to your real table later
  // const { data, error } = await supabase
  //   .from("subscriptions")
  //   .select("status")
  //   .eq("tenant_id", tenantId)
  //   .single();
  // if (error || !data || data.status !== "active") {
  //   throw new Error("No active subscription.");
  // }
  return;
}

// Crawl a list of URLs (already filtered to origin + capped)
async function crawlUrls(
  tenantId: string,
  urls: string[],
  origin: string
): Promise<{ pages: number; chunks: number }> {
  let totalPages = 0;
  let totalChunks = 0;

  for (const url of urls) {
    if (!isSameOrigin(url, origin)) continue;

    const html = await safeFetch(url);
    if (!html) continue;
    totalPages++;

    const text = extractText(html);
    if (!text) continue;

    const chunks = chunkText(text, 800, 100);
    if (chunks.length === 0) continue;

    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const vectors = await createEmbeddings(batch);

      const rows = batch.map((content, j) => ({
        tenant_id: tenantId,
        url,
        chunk_index: i + j,
        content,
        embedding: vectors[j] as unknown as any,
      }));

      const { error } = await supabase.from("page_chunks").insert(rows);
      if (error) {
        console.error("[import-sitemap] Supabase insert error:", error.message);
        continue;
      }
      totalChunks += rows.length;
    }

    console.log(`[import-sitemap] Indexed ${url} (${chunks.length} chunks)`);
  }

  return { pages: totalPages, chunks: totalChunks };
}

// Expand a sitemap index recursively (limited)
async function expandSitemapIndex(
  startUrls: string[],
  origin: string,
  hardCap: number
): Promise<string[]> {
  const queue = [...startUrls];
  const seen = new Set<string>();
  const collectedPageUrls: string[] = [];

  while (queue.length && collectedPageUrls.length < hardCap) {
    const smUrl = queue.shift()!;
    if (seen.has(smUrl)) continue;
    seen.add(smUrl);

    const xml = await safeFetch(smUrl);
    if (!xml) continue;

    const { urls, nestedSitemaps } = await parseSitemapXml(xml);

    // Add normal page URLs
    for (const u of urls) {
      if (isSameOrigin(u, origin)) {
        collectedPageUrls.push(u);
        if (collectedPageUrls.length >= hardCap) break;
      }
    }
    if (collectedPageUrls.length >= hardCap) break;

    // Explore nested sitemap indexes (still same origin)
    for (const child of nestedSitemaps) {
      if (isSameOrigin(child, origin) && !seen.has(child)) {
        queue.push(child);
      }
    }
  }

  // de-dup & return
  return Array.from(new Set(collectedPageUrls));
}

// ---------- Route ----------
export async function POST(req: Request): Promise<Response> {
  try {
    // Accept JSON or multipart
    const contentType = req.headers.get("content-type") || "";
    let tenantId = "";
    let sitemapUrl = "";
    let maxPages = DEFAULT_MAX_PAGES;
    let uploadedXml: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await readJson<{ tenantId?: string; sitemapUrl?: string; maxPages?: number }>(req);
      tenantId = (body?.tenantId || "").trim();
      sitemapUrl = (body?.sitemapUrl || "").trim();
      maxPages = Math.min(Math.max(1, body?.maxPages || DEFAULT_MAX_PAGES), 200); // 1..200
    } else if (contentType.includes("multipart/form-data")) {
      const { fields, fileXml } = await readMultipart(req);
      tenantId = (fields?.tenantId || "").trim();
      sitemapUrl = (fields?.sitemapUrl || "").trim();
      maxPages = Math.min(Math.max(1, Number(fields?.maxPages) || DEFAULT_MAX_PAGES), 200);
      uploadedXml = fileXml;
    } else {
      return new Response(JSON.stringify({ error: "Use JSON or multipart/form-data" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenantId is required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    await assertActiveSubscription(tenantId);

    // Determine origin for filtering internal URLs
    let origin = "";
    if (sitemapUrl) {
      try { origin = new URL(sitemapUrl).origin; } catch { /* ignore */ }
    }

    // Get initial XML (from URL or uploaded file)
    let xml = "";
    if (uploadedXml && uploadedXml.trim()) {
      xml = uploadedXml;
    } else if (sitemapUrl) {
      xml = await safeFetch(sitemapUrl);
      if (!xml) {
        return new Response(JSON.stringify({ error: "Failed to fetch sitemapUrl" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Provide sitemapUrl or upload sitemap.xml" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Parse first sitemap
    const { urls: firstUrls, nestedSitemaps } = await parseSitemapXml(xml);

    // Build URL list:
    //  - if urlset: use firstUrls (filtered to origin if URL given)
    //  - if sitemapindex: expand recursively to collect page URLs
    let pageUrls: string[] = [];

    if (firstUrls.length) {
      pageUrls = origin
        ? firstUrls.filter((u) => isSameOrigin(u, origin))
        : firstUrls; // uploaded file may not carry origin
    } else if (nestedSitemaps.length) {
      if (!origin) {
        // If uploaded file was a sitemap index but no URL (so no origin), infer from first child
        try { origin = new URL(nestedSitemaps[0]).origin; } catch {}
      }
      const startList = origin
        ? nestedSitemaps.filter((u) => isSameOrigin(u, origin))
        : nestedSitemaps;
      pageUrls = await expandSitemapIndex(startList, origin || "", maxPages);
    } else {
      return new Response(JSON.stringify({ error: "Sitemap appears empty" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Cap & dedupe
    pageUrls = Array.from(new Set(pageUrls)).slice(0, maxPages);
    if (!pageUrls.length) {
      return new Response(JSON.stringify({ error: "No page URLs found in sitemap" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Crawl & index
    const baseOrigin = origin || ((): string => { try { return new URL(pageUrls[0]).origin; } catch { return ""; } })();
    const { pages, chunks } = await crawlUrls(tenantId, pageUrls, baseOrigin);

    return new Response(JSON.stringify({ ok: true, pages, chunks }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[import-sitemap] unexpected error:", e?.message || e);
    return new Response(JSON.stringify({ error: "Import failed" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
