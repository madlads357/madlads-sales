const {
  MADLADS_ROYALTY_ADDRESS,
  MADLADS_IMAGE_BASE_URL,
  MADLADS_NAME_RE,
  LAMPORTS_PER_SOL,
} = require("./constants");
const { fetchAssetByMint } = require("./helius");

const isNftSale = (transaction) => {
  const event = transaction?.events?.nft;
  const type = transaction?.type || event?.type;
  return type === "NFT_SALE" || event?.type === "NFT_SALE";
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

const imageUrlForId = (id) => `${MADLADS_IMAGE_BASE_URL}/${id}.png`;

const resolveMadLadsInfo = async (transaction) => {
  const description = transaction?.events?.nft?.description || transaction?.description || "";
  const descMatch = description.match(MADLADS_NAME_RE);
  const mintCandidates = getMintCandidates(transaction);

  if (descMatch) {
    return { id: descMatch[1], image: imageUrlForId(descMatch[1]) };
  }

  for (const mint of mintCandidates) {
    const asset = await fetchAssetByMint(mint);
    if (!asset) continue;

    const name = asset?.content?.metadata?.name || "";
    const symbol = asset?.content?.metadata?.symbol || "";
    const isMadLads = MADLADS_NAME_RE.test(name) || symbol.toUpperCase() === "MAD";
    if (!isMadLads) continue;

    const nameMatch = name.match(MADLADS_NAME_RE);
    return {
      id: nameMatch ? nameMatch[1] : "Unknown",
      image:
        asset?.content?.links?.image ||
        (nameMatch ? imageUrlForId(nameMatch[1]) : "unknown"),
    };
  }

  if (hasMadLadsRoyaltyTransfer(transaction)) {
    return { id: "Unknown", image: "unknown" };
  }

  return null;
};

const buildSaleRecord = async (transaction, marketplaceLabel) => {
  if (!isNftSale(transaction)) {
    return { sale: null, ignoreReason: "not_nft_sale" };
  }

  const madLads = await resolveMadLadsInfo(transaction);
  if (!madLads) {
    return { sale: null, ignoreReason: "not_mad_lads" };
  }

  const amountLamports = inferAmountLamports(transaction);
  const amountSol = amountLamports > 0 ? amountLamports / LAMPORTS_PER_SOL : Number.NaN;

  return {
    sale: {
      signature: transaction?.signature || "",
      id: madLads.id,
      price: Number.isFinite(amountSol) ? amountSol.toFixed(2) : "unknown",
      marketplace: marketplaceLabel,
      image: madLads.image,
    },
    ignoreReason: null,
  };
};

module.exports = { buildSaleRecord };
