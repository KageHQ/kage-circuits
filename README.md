<h1 align="center">@kagehq/circuits</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Circom-4B0082?style=flat-square" alt="Circom">
  <img src="https://img.shields.io/badge/Groth16-2D7FF9?style=flat-square" alt="Groth16">
  <img src="https://img.shields.io/badge/Zero--Knowledge-6E56CF?style=flat-square" alt="Zero-Knowledge">
  <img src="https://img.shields.io/badge/Solana-000?style=flat-square&logo=solana&logoColor=14F195" alt="Solana">
</p>

The Circom `age_kyc` circuit and its Groth16 trusted-setup artifacts for the **Kage** demo — a zero-knowledge e-KYC flow on Solana that proves a valid Indonesian KTP and age ≥ 18 without revealing the holder's NIK, name, or date of birth.

This repo produces the `.wasm`, `.zkey`, and `verification_key.json` consumed by **kage-mobile** (witness generation / proving), **kage-program** (verifying key), and **kage-e2e** (end-to-end proving).

---

## What the circuit proves

`age_kyc` takes a user's Indonesian KTP (NIK) credential and proves — in zero knowledge — three things:

1. **Valid issuer signature** — the KTP data `(NIK, name, secret)` was signed by the issuer via EdDSA-Poseidon. The issuer's public key `(Ax, Ay)` is a public signal, so the verifier can check it against the known trusted issuer.
2. **Age ≥ minAge** — the birth date encoded inside the NIK (digits 6–11: `DD MM YY`, with female records adding 40 to the day) is at least `minAge` years before `currentDateInt`. `minAge` is `18` in the demo.
3. **Sybil-resistant nullifier** — `nullifierHash = Poseidon(secret)`, where `secret` is known only to the holder. The nullifier is deterministic per credential but reveals nothing about the identity.

The verifier learns only `pass` plus the nullifier — no NIK, name, or date of birth is disclosed.

### Public signals (declaration order)

```
Ax, Ay           — issuer EdDSA public key (BabyJubJub)
currentDateInt   — today as YYYYMMDD integer
currentYY        — 2-digit current year (century disambiguation)
minAge           — minimum age requirement (e.g. 18)
nullifierHash    — Poseidon(secret), sybil-resistance token
```

### Private inputs

`nik[16]`, `name`, `secret`, `R8x`, `R8y`, `S` (the EdDSA signature components).

---

## Install

This package is published to GitHub Packages. Add an `.npmrc` to your consuming repo:

```ini
@kagehq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

A GitHub PAT with **`read:packages`** scope is required. Never commit the token.

```bash
pnpm add @kagehq/circuits
```

## Build

```bash
pnpm build
```

Runs the full trusted-setup pipeline (see [Build pipeline](#build-pipeline) below). Expect **3–8 minutes** on a modern laptop. The build artifacts are gitignored locally and only exist after `pnpm build`.

## Test

```bash
pnpm test
```

Runs Mocha tests in `test/` (timeout 100 s). The suite covers:

- Male KTP holder aged ≥ 18 — accepted.
- Female record (day + 40 encoding), minor (born 2010) — rejected.
- Tampered NIK (signature invalidated) — rejected.
- Credential produced by the `kage-issuer` module — accepted end-to-end.

Tests use `circom_tester` for witness calculation; they do **not** require the built `.wasm`/`.zkey` artifacts.

---

## Exports

`index.js` exports absolute filesystem paths to the packed build artifacts:

```js
const {
  wasmPath,            // build/age_kyc_js/age_kyc.wasm
  zkeyPath,            // build/age_kyc.zkey
  verificationKeyPath, // build/verification_key.json
  verificationKey,     // () => Object  — loads and returns the JSON key
} = require("@kagehq/circuits");
```

**Proof generation** (kage-mobile / kage-e2e):

```js
const { wasmPath, zkeyPath } = require("@kagehq/circuits");
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
```

**Off-chain verify** (kage-program tests):

```js
const { verificationKey } = require("@kagehq/circuits");
const ok = await snarkjs.groth16.verify(verificationKey(), publicSignals, proof);
```

---

## Build pipeline

`scripts/build.sh` performs the full trusted-setup pipeline:

1. **Compile** — `circom circuits/age_kyc.circom --r1cs --wasm --sym` → `build/`
2. **Powers of Tau (bn128, 2¹⁴)** — generates `pot14_0000.ptau`, makes one fixed-entropy contribution, prepares phase 2. Skipped if `build/pot14.ptau` already exists.
3. **Groth16 setup** — `snarkjs groth16 setup` produces `age_kyc_0000.zkey`, then one fixed-entropy contribution yields `age_kyc.zkey`.
4. **Export verifying key** — `snarkjs zkey export verificationkey` → `build/verification_key.json`.

> **WARNING — rebuild = new verifying key.**
> Every `pnpm build` runs a fresh Groth16 setup and produces a **new** `verification_key.json` and `age_kyc.zkey`. Any consumer that hardcodes the verifying key — most critically `kage-program`'s `verifying_key.rs` — **must be regenerated** after a republish of this package. If the on-chain verifying key does not match the zkey used to produce a proof, all on-chain verifications will be rejected.

---

## Published artifacts

Three files are shipped inside the npm tarball (listed in `package.json` → `files`):

| File | Purpose |
|------|---------|
| `build/age_kyc_js/age_kyc.wasm` | WebAssembly witness calculator |
| `build/age_kyc.zkey` | Proving key (Groth16, bn128) |
| `build/verification_key.json` | Verifying key — consumed by off-chain and on-chain verifiers |

These files are gitignored locally and only exist after `pnpm build`. They are included in the published tarball at `npm publish` time.

---

## Limitations

The trusted setup uses a **single fixed-entropy contribution** for both the Powers-of-Tau and the circuit-specific phase. This is sufficient for a demo but is **not production-safe** — a real deployment requires a multi-party ceremony with independent contributors so that no single party holds toxic waste.

---

## Sibling repos

| Repo | Role |
|------|------|
| [kage-shared](https://github.com/KageHQ/kage-shared) | Foundation — proof codec, constants, `createIssuer` / `nikToField` |
| **kage-circuits** | Circom `age_kyc` circuit + Groth16 trusted setup → wasm/zkey/vk **(this repo)** |
| [kage-issuer](https://github.com/KageHQ/kage-issuer) | Mock KTP credential issuer HTTP service (EdDSA-Poseidon) |
| [kage-program](https://github.com/KageHQ/kage-program) | Solana Anchor program — Groth16 verify + nullifier PDA |
| [kage-web](https://github.com/KageHQ/kage-web) | React/Vite browser verifier + QR scanner |
| [kage-mobile](https://github.com/KageHQ/kage-mobile) | React Native/Expo on-device proving + QR generation |
| [kage-e2e](https://github.com/KageHQ/kage-e2e) | End-to-end happy-path integration harness |
