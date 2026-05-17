const { MARKETPLACE_LABELS } = require("./constants");

const formatMarketplaceLabel = (source) => {
  if (!source) return "Unknown";
  if (MARKETPLACE_LABELS[source]) return MARKETPLACE_LABELS[source];
  return source
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

module.exports = { formatMarketplaceLabel };
