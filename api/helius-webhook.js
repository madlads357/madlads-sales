const { processWebhookEvent } = require("../lib/process-event");

const normalizePayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload) return [payload];
  return [];
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const events = normalizePayload(req.body);
  console.log(
    `[webhook] received count=${events.length} sources=${events
      .map((e) => e?.source || "unknown")
      .join(",")}`
  );

  if (events.length === 0) {
    return res.status(200).json({ received: 0 });
  }

  let processed = 0;
  const ignoreReasons = [];

  for (const tx of events) {
    try {
      const result = await processWebhookEvent(tx);
      if (result.processed) processed += 1;
      else if (result.reason) ignoreReasons.push(result.reason);
    } catch (error) {
      console.error("[webhook] event error:", error?.message || error);
      ignoreReasons.push("error");
    }
  }

  const ignored = events.length - processed;
  console.log(
    `[webhook] processed=${processed} ignored=${ignored}`,
    ignoreReasons.length ? ignoreReasons : ""
  );

  return res.status(200).json({ received: events.length, processed, ignored, ignoreReasons });
};
