const axios = require("axios");
const { TwitterApi } = require("twitter-api-v2");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.API_Key;
const MADLADS_ROYALTY_ADDRESS = "2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW";
const MADLADS_IMAGE_BASE_URL = "https://madlads.s3.us-west-2.amazonaws.com/images";
const ALLOWED_SOURCES = new Set(["MAGIC_EDEN", "TENSOR"]);
const assetCache = new Map();
const processedSignatures = new Set();
const MAX_SIGNATURE_CACHE = 1000;
let twitterRwClient = null;
let twitterClient = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getTwitterClients = () => {
  if (twitterRwClient && twitterClient) {
    return { twitterClient, twitterRwClient };
  }

  const appKey = process.env.API_Key;
  const appSecret = process.env.API_Secret;
  const accessToken = process.env.Access_Token;
  const accessSecret = process.env.Access_Token_Secret;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      "Missing Twitter credentials (API_Key, API_Secret, Access_Token, Access_Token_Secret)."
    );
  }

  twitterClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
  twitterRwClient = twitterClient.readWrite;
  return { twitterClient, twitterRwClient };
};

const inferAmountLamports = (transaction) => {
  const eventAmount = Number(transaction?.events?.nft?.amount || 0);
  if (eventAmount > 0) return eventAmount;

  const nativeAmounts = (transaction?.nativeTransfers || [])
    .map((transfer) => Number(transfer?.amount || 0))
    .filter((amount) => amount > 0);

  return nativeAmounts.length > 0 ? Math.max(...nativeAmounts) : 0;
};

const hasMadLadsRoyaltyTransfer = (transaction) =>
  (transaction?.nativeTransfers || []).some(
    (transfer) =>
      transfer?.toUserAccount === MADLADS_ROYALTY_ADDRESS &&
      Number(transfer?.amount || 0) > 0
  );

const getMintCandidates = (transaction) => {
  const eventMints = (transaction?.events?.nft?.nfts || []).map((nft) => nft?.mint);
  const transferMints = (transaction?.tokenTransfers || [])
    .filter(
      (transfer) =>
        transfer?.mint &&
        Number(transfer?.tokenAmount) === 1 &&
        String(transfer?.tokenStandard || "").toLowerCase().includes("nonfungible")
    )
    .map((transfer) => transfer.mint);
  return [...new Set([...eventMints, ...transferMints].filter(Boolean))];
};

const fetchAssetByMint = async (mint) => {
  if (!HELIUS_API_KEY) return null;
  if (!mint) return null;
  if (assetCache.has(mint)) return assetCache.get(mint);

  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: "2.0",
        id: "madlads-sales-bot",
        method: "getAsset",
        params: { id: mint },
      },
      { timeout: 15000 }
    );
    const asset = response.data?.result || null;
    assetCache.set(mint, asset);
    return asset;
  } catch (error) {
    const code = error?.response?.data?.error?.code;
    if (code === -32429) await sleep(250);
    return null;
  }
};

const resolveMadLadsInfo = async (transaction, platformKey) => {
  const description = transaction?.events?.nft?.description || transaction?.description || "";
  const descMatch = description.match(/Mad Lads #(\d+)/i);
  const mintCandidates = getMintCandidates(transaction);

  if (descMatch) {
    const id = descMatch[1];
    return {
      id,
      mint: mintCandidates[0] || "unknown",
      image: `${MADLADS_IMAGE_BASE_URL}/${id}.png`,
    };
  }

  for (const mint of mintCandidates) {
    const asset = await fetchAssetByMint(mint);
    if (!asset) continue;

    const name = asset?.content?.metadata?.name || "";
    const symbol = asset?.content?.metadata?.symbol || "";
    const isMadLads = /Mad Lads #(\d+)/i.test(name) || symbol.toUpperCase() === "MAD";
    if (!isMadLads) continue;

    const nameMatch = name.match(/Mad Lads #(\d+)/i);
    return {
      id: nameMatch ? nameMatch[1] : "Unknown",
      mint,
      image:
        asset?.content?.links?.image ||
        (nameMatch ? `${MADLADS_IMAGE_BASE_URL}/${nameMatch[1]}.png` : "unknown"),
    };
  }

  if (platformKey === "TENSOR" && hasMadLadsRoyaltyTransfer(transaction)) {
    return { id: "Unknown", mint: mintCandidates[0] || "unknown", image: "unknown" };
  }

  return null;
};

const buildSaleRecord = async (transaction, platformLabel, platformKey) => {
  const event = transaction?.events?.nft;
  const type = transaction?.type || event?.type;
  if (type !== "NFT_SALE" && event?.type !== "NFT_SALE") {
    return { sale: null, ignoreReason: "not_nft_sale" };
  }

  const madLadsInfo = await resolveMadLadsInfo(transaction, platformKey);
  if (!madLadsInfo) {
    return { sale: null, ignoreReason: "not_mad_lads" };
  }

  const amountLamports = inferAmountLamports(transaction);
  const amountSol = amountLamports > 0 ? amountLamports / 1_000_000_000 : Number.NaN;

  return {
    sale: {
      signature: transaction?.signature || "",
      id: madLadsInfo.id,
      price: Number.isFinite(amountSol) ? amountSol.toFixed(2) : "unknown",
      marketplace: platformLabel,
      image: madLadsInfo.image,
    },
    ignoreReason: null,
  };
};

const trimSignatureCache = () => {
  while (processedSignatures.size > MAX_SIGNATURE_CACHE) {
    const first = processedSignatures.values().next().value;
    processedSignatures.delete(first);
  }
};

const postSaleTweet = async (sale) => {
  const { twitterRwClient: rwClient, twitterClient: rawClient } = getTwitterClients();

  const headline = sale.id !== "Unknown" ? `Mad Lads #${sale.id}` : "Mad Lads";
  const tweetText = `${headline}\n\nSold for ◎${sale.price} on ${sale.marketplace}\n\n@madlads #MadLads`;

  try {
    if (sale.image && sale.image !== "unknown") {
      const imageResponse = await axios.get(sale.image, {
        responseType: "arraybuffer",
        timeout: 12000,
      });
      const mediaId = await rawClient.v1.uploadMedia(Buffer.from(imageResponse.data), {
        mimeType: "image/png",
      });

      await rwClient.v2.tweet({
        text: tweetText,
        media: { media_ids: [mediaId] },
      });
      console.log(`[tweet] posted with image for ${sale.signature}`);
      return;
    }

    await rwClient.v2.tweet({ text: tweetText });
    console.log(`[tweet] posted text-only for ${sale.signature}`);
  } catch (error) {
    console.error("[tweet] failed:", error?.data || error?.message || error);
  }
};

const processWebhookEvent = async (tx) => {
  const source = tx?.source;
  if (!ALLOWED_SOURCES.has(source)) {
    console.log(`[ignore] reason=wrong_source source=${source || "missing"}`);
    return { processed: false, reason: "wrong_source" };
  }

  const signature = tx?.signature;
  if (!signature) {
    console.log(`[ignore] reason=no_signature source=${source}`);
    return { processed: false, reason: "no_signature" };
  }
  if (processedSignatures.has(signature)) {
    console.log(`[ignore] reason=duplicate_signature sig=${signature.slice(0, 12)}...`);
    return { processed: false, reason: "duplicate_signature" };
  }

  const platformLabel = source === "MAGIC_EDEN" ? "Magic Eden" : "Tensor";
  const { sale, ignoreReason } = await buildSaleRecord(tx, platformLabel, source);
  if (!sale) {
    console.log(`[ignore] reason=${ignoreReason} sig=${signature.slice(0, 12)}...`);
    return { processed: false, reason: ignoreReason };
  }

  processedSignatures.add(signature);
  trimSignatureCache();

  await postSaleTweet(sale);
  return { processed: true, reason: null };
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const payload = req.body;
  const events = Array.isArray(payload) ? payload : payload ? [payload] : [];
  console.log(
    `[webhook] request received: count=${events.length}, sources=${events
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
      console.error("Webhook event processing error:", error?.message || error);
      ignoreReasons.push("error");
    }
  }

  const ignored = events.length - processed;
  console.log(`[webhook] processed=${processed}, ignored=${ignored}`, ignoreReasons.length ? ignoreReasons : "");
  return res.status(200).json({ received: events.length, processed, ignored, ignoreReasons });
};
