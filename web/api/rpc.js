/**
 * Same-origin JSON-RPC proxy for Arc testnet.
 *
 * The public Arc RPC (https://rpc.testnet.arc.network, behind Cloudflare) does
 * not return CORS headers, so a browser making a cross-origin `application/json`
 * POST to it is blocked and surfaces as "Failed to fetch". Node code (e.g. the
 * agent keeper) is unaffected because it isn't subject to CORS.
 *
 * This Vercel serverless function forwards the browser's JSON-RPC request to the
 * RPC server-side (server-to-server, no CORS) and returns the response from our
 * own origin, so `getReadProvider()` in the web app can read chain state again.
 * It forwards the body verbatim, so both single calls and ethers' batched
 * request arrays pass through unchanged.
 */
const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});

    const upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32011,
        message: `rpc proxy: ${err?.message || "upstream request failed"}`,
      },
    });
  }
}
