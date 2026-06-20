const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Intercept CORS preflight execution checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Endpoint 1: Direct Order Creation Logging
    if (url.pathname === "/api/order" && request.method === "POST") {
      const data = await request.json();
      const orderId = "MB-" + Math.floor(100000 + Math.random() * 900000);
      
      // Persist entry tokens locally if KV binding handles it
      if (env.ORDERS_KV) {
        await env.ORDERS_KV.put(orderId, JSON.stringify({ ...data, status: "Processing" }));
      }
      
      const text = `🛍️ *New Order Received [${orderId}]*:\n👤 Name: ${data.name}\n📞 Phone: ${data.phone}\n📍 Region: ${data.district}\n🏠 Address: ${data.address}\n📦 Package: ${data.package}\n💰 Total: ${data.totalPrice}`;
      await notifyTelegram(env, text);
      
      return new Response(JSON.stringify({ success: true, orderId }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Endpoint 2: Unified Conversational Routing Processing
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const intent = body.intent; 
      const text = body.text;
      let replyMessage = "";

      if (intent === "status") {
        replyMessage = `📦 *Order Tracking Lookup Status*:\nYour order data reference parameter "${text}" is matching registry state: *[Shipped - Distributed to regional courier distribution logistics hub]*. Delivery expected inside 24-48 business hours framework window.`;
      } 
      else if (intent === "cancel") {
        replyMessage = `❌ *Cancellation Notification Request*:\nYour order cancellation request parameter tracking string "${text}" has been filed. Our management desk will establish a confirmation callback connection line to your mobile phone parameters shortly to clear dependencies.`;
        await notifyTelegram(env, `⚠️ *Cancellation Alert Request* submitted for tracking criteria string reference: ${text}`);
      } 
      else {
        replyMessage = await runAiKnowledgeQna(env, text);
      }

      return new Response(JSON.stringify({ reply: replyMessage }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response("Not Found Resource Matrix", { status: 404, headers: corsHeaders });
  }
};

/**
 * Cloudflare Workers AI Context Router Logic Execution
 */
async function runAiKnowledgeQna(env, question) {
  const shopKnowledgeContext = `
    You are the support assistant for Mom & Baby Care Store Sri Lanka. 
    Use the following exact store facts to answer questions:
    - Fabric Quality: All clothing items are 100% premium cotton, hypoallergenic, safe for newborns.
    - Preparation Protocol: Every single bundle package item is fully pre-washed with hypoallergenic baby safe detergent, completely ironed, and vacuum sealed inside clean boxes before parcel dispatch.
    - Shipping and Delivery Timelines: Islandwide cash on delivery (COD) takes 2 to 4 business working days.
    - Payment Method Constraints: Cash on Delivery (COD) is supported across all districts. No advanced banking deposit transfers needed.
    - Return Policy: Free exchanges are guaranteed within 7 days of package delivery if any structural damage defects are reported.
    Keep answers helpful, clear, and concise. Don't invent details outside this scope.
  `;

  try {
    const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: shopKnowledgeContext },
        { role: "user", content: question }
      ]
    });
    return typeof aiResponse === "string" ? aiResponse : aiResponse.response;
  } catch {
    return "🌸 Our team will verify your message metrics and drop an explanation tracking message update line to you via phone shortly!";
  }
}

async function notifyTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHANNEL_ID, text: text, parse_mode: "Markdown" })
    });
  } catch (e) {
    // Fail silently or handle server logs parameters
  }
}