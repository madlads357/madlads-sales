const { hasSeen, markSeen } = require("./dedupe");
const { formatMarketplaceLabel } = require("./marketplace");
const { buildSaleRecord } = require("./sales");
const { postSaleTweet } = require("./twitter");

const processWebhookEvent = async (tx) => {
  const source = tx?.source;
  const signature = tx?.signature;

  if (!signature) {
    console.log(`[ignore] reason=no_signature source=${source || "missing"}`);
    return { processed: false, reason: "no_signature" };
  }

  if (hasSeen(signature)) {
    console.log(`[ignore] reason=duplicate_signature sig=${signature.slice(0, 12)}...`);
    return { processed: false, reason: "duplicate_signature" };
  }

  const { sale, ignoreReason } = await buildSaleRecord(tx, formatMarketplaceLabel(source));
  if (!sale) {
    console.log(`[ignore] reason=${ignoreReason} sig=${signature.slice(0, 12)}...`);
    return { processed: false, reason: ignoreReason };
  }

  markSeen(signature);
  await postSaleTweet(sale);
  return { processed: true, reason: null };
};

module.exports = { processWebhookEvent };
