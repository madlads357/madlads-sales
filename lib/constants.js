const MADLADS_ROYALTY_ADDRESS = "2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW";
const MADLADS_IMAGE_BASE_URL = "https://madlads.s3.us-west-2.amazonaws.com/images";
const MADLADS_NAME_RE = /Mad Lads #(\d+)/i;
const LAMPORTS_PER_SOL = 1_000_000_000;
const MAX_SIGNATURE_CACHE = 1000;

const MARKETPLACE_LABELS = {
  MAGIC_EDEN: "Magic Eden",
  TENSOR: "Tensor",
  HYPERSPACE: "Hyperspace",
  SOLANART: "Solanart",
  SOLSEA: "Solsea",
  FORM_FUNCTION: "Formfunction",
  EXCHANGE_ART: "Exchange Art",
  DIGITAL_EYES: "Digital Eyes",
  YAWWW: "Yawww",
  METAPLEX: "Metaplex",
  ENGLISH_AUCTION: "English Auction",
  FOXY_AUCTION: "Foxy Auction",
};

module.exports = {
  MADLADS_ROYALTY_ADDRESS,
  MADLADS_IMAGE_BASE_URL,
  MADLADS_NAME_RE,
  LAMPORTS_PER_SOL,
  MAX_SIGNATURE_CACHE,
  MARKETPLACE_LABELS,
};
