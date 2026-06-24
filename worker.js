const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // -----------------------------
    // CORS PRE-FLIGHT HANDLER
    // -----------------------------
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // -----------------------------
    // 1. ORDER API
    // -----------------------------
    if (url.pathname === "/api/order" && request.method === "POST") {
      const data = await request.json();
      const orderId = "MB-" + Math.floor(100000 + Math.random() * 900000);

      if (env.ORDERS_KV) {
        await env.ORDERS_KV.put(
          orderId,
          JSON.stringify({ ...data, status: "Processing" })
        );
      }

      const text =
        `🛍️ *New Order Received [${orderId}]*:\n` +
        `👤 Name: ${data.name}\n` +
        `📞 Phone: ${data.phone}\n` +
        `📍 Region: ${data.district}\n` +
        `🏠 Address: ${data.address}\n` +
        `📦 Package: ${data.package}\n` +
        `💰 Total: ${data.totalPrice}`;

      await notifyTelegram(env, text);

      return new Response(JSON.stringify({ success: true, orderId }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // -----------------------------
    // 2. CHAT API
    // -----------------------------
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const intent = body.intent;
      const text = body.text;

      let replyMessage = "";

      if (intent === "status") {
        replyMessage =
          `📦 *Order Tracking Status*:\n` +
          `Order "${text}" is currently being processed in the delivery system.`;
      } else if (intent === "cancel") {
        replyMessage =
          `❌ *Cancellation Request Received*:\n` +
          `Your request for "${text}" has been submitted.`;

        await notifyTelegram(env, `⚠️ Cancellation request: ${text}`);
      } else {
        replyMessage = await runAiKnowledgeQna(env, text);
      }

      return new Response(JSON.stringify({ reply: replyMessage }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // -----------------------------
    // 3. FRONTEND PAGES
    // -----------------------------
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === "/kit-builder" || url.pathname === "/kit-builder.html") {
      return env.ASSETS.fetch(new Request(new URL("/kit-builder.html", request.url)));
    }

    // -----------------------------
    // 4. STATIC FILES (CSS/JS/IMAGES)
    // -----------------------------
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse && assetResponse.status !== 404) {
      return assetResponse;
    }

    // -----------------------------
    // 5. SPA FALLBACK (IMPORTANT FIX)
    // -----------------------------
    return env.ASSETS.fetch(
      new Request(new URL("/index.html", request.url))
    );
  },
};

/**
 * AI CHATBOT LOGIC
 */
async function runAiKnowledgeQna(env, question) {
  const shopKnowledgeContext = `
You are the support assistant for Mom & Baby Care Store Sri Lanka.

- All products are 100% premium cotton
- Hypoallergenic and safe for newborns
- COD delivery takes 2–4 working days
- Free exchanges within 7 days of delivery
- Keep answers short and helpful
`;

  try {
    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct",
      {
        messages: [
          { role: "system", content: shopKnowledgeContext },
          { role: "user", content: question },
        ],
      }
    );

    return typeof aiResponse === "string"
      ? aiResponse
      : aiResponse.response;
  } catch {
    return "Our support team will respond shortly.";
  }
}

/**
 * TELEGRAM NOTIFICATION
 */
async function notifyTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHANNEL_ID,
          text,
          parse_mode: "Markdown",
        }),
      }
    );
  } catch (e) {
    // silent fail
  }
}
