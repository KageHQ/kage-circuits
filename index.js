const path = require("path");
const BUILD = path.join(__dirname, "build");
module.exports = {
  wasmPath: path.join(BUILD, "age_kyc_js", "age_kyc.wasm"),
  zkeyPath: path.join(BUILD, "age_kyc.zkey"),
  verificationKeyPath: path.join(BUILD, "verification_key.json"),
  verificationKey: () => require(path.join(BUILD, "verification_key.json")),
};
