const { MAX_SIGNATURE_CACHE } = require("./constants");

const processedSignatures = new Set();

const hasSeen = (signature) => processedSignatures.has(signature);

const markSeen = (signature) => {
  processedSignatures.add(signature);
  while (processedSignatures.size > MAX_SIGNATURE_CACHE) {
    const oldest = processedSignatures.values().next().value;
    processedSignatures.delete(oldest);
  }
};

module.exports = { hasSeen, markSeen };
