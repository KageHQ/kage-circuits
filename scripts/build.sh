#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=build
mkdir -p "$BUILD"

echo "==> Compiling circuit"
circom circuits/age_kyc.circom --r1cs --wasm --sym -o "$BUILD" -l node_modules

echo "==> Powers of Tau (bn128, 2^14)"
PTAU="$BUILD/pot14.ptau"
if [ ! -f "$PTAU" ]; then
  pnpm exec snarkjs powersoftau new bn128 14 "$BUILD/pot14_0000.ptau" -v
  pnpm exec snarkjs powersoftau prepare phase2 "$BUILD/pot14_0000.ptau" "$PTAU" -v
fi

echo "==> Groth16 setup"
pnpm exec snarkjs groth16 setup "$BUILD/age_kyc.r1cs" "$PTAU" "$BUILD/age_kyc_0000.zkey"
pnpm exec snarkjs zkey contribute "$BUILD/age_kyc_0000.zkey" "$BUILD/age_kyc.zkey" --name="demo" -e="demo-entropy-fixed-string-for-reproducibility" -v
pnpm exec snarkjs zkey export verificationkey "$BUILD/age_kyc.zkey" "$BUILD/verification_key.json"

echo "==> Artifacts in $BUILD: age_kyc_js/age_kyc.wasm, age_kyc.zkey, verification_key.json"
