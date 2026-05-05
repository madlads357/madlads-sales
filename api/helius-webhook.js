const axios = require("axios");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.API_Key;
const MADLADS_ROYALTY_ADDRESS = "2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW";
const MADLADS_IMAGE_BASE_URL = "https://madlads.s3.us-west-2.amazonaws.com/images";
const ALLOWED_SOURCES = new Set(["MAGIC_EDEN", "TENSOR"]);
const assetCache = new Map();
const processedSignatures = new Set();
const MAX_SIGNATURE_CACHE = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (type !== "NFT_SALE" && event?.type !== "NFT_SALE") return null;

  const madLadsInfo = await resolveMadLadsInfo(transaction, platformKey);
  if (!madLadsInfo) return null;

  const amountLamports = inferAmountLamports(transaction);
  const amountSol = amountLamports > 0 ? amountLamports / 1_000_000_000 : Number.NaN;

  return {
    signature: transaction?.signature || "",
    id: madLadsInfo.id,
    price: Number.isFinite(amountSol) ? amountSol.toFixed(2) : "unknown",
    marketplace: platformLabel,
    image: madLadsInfo.image,
  };
};

const trimSignatureCache = () => {
  while (processedSignatures.size > MAX_SIGNATURE_CACHE) {
    const first = processedSignatures.values().next().value;
    processedSignatures.delete(first);
  }
};

const processWebhookEvent = async (tx) => {
  const source = tx?.source;
  if (!ALLOWED_SOURCES.has(source)) return;

  const signature = tx?.signature;
  if (!signature || processedSignatures.has(signature)) return;

  const platformLabel = source === "MAGIC_EDEN" ? "Magic Eden" : "Tensor";
  const sale = await buildSaleRecord(tx, platformLabel, source);
  if (!sale) return;

  processedSignatures.add(signature);
  trimSignatureCache();

  console.log(`Madlads #${sale.id}`);
  console.log(`Sold for ${sale.price} on ${sale.marketplace}`);
  console.log(`image ${sale.image}`);
  console.log(`tx https://solscan.io/tx/${sale.signature}\n`);
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const payload = req.body;
  const events = Array.isArray(payload) ? payload : payload ? [payload] : [];
  if (events.length === 0) {
    return res.status(200).json({ received: 0 });
  }

  for (const tx of events) {
    try {
      await processWebhookEvent(tx);
    } catch (error) {
      console.error("Webhook event processing error:", error?.message || error);
    }
  }

  return res.status(200).json({ received: events.length });
};
