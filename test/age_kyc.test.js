const path = require("path");
const { expect } = require("chai");
const wasm_tester = require("circom_tester").wasm;
const { buildInput } = require("./helpers");

const { DEMO_ISSUER_PRIV } = require("@kagehq/shared");
const ISSUER_PRIV = Buffer.from(DEMO_ISSUER_PRIV, "hex");

// NIK layout: PP RR DD | DD MM YY | SSSS ; positions 6,7=day 8,9=month 10,11=yy
const NIK_MALE_1995 = "3174071708950001";   // day=17, month=08, yy=95
const NIK_FEMALE_2010 = "3174074905100002"; // day=09+40=49, month=05, yy=10

describe("age_kyc", function () {
  this.timeout(100000);
  let circuit;
  before(async () => {
    circuit = await wasm_tester(
      path.join(__dirname, "..", "circuits", "age_kyc.circom"),
      { include: [path.join(__dirname, "..", "node_modules")] }
    );
  });

  it("accepts a male KTP holder who is >= 18", async () => {
    const { input } = await buildInput({
      nik: NIK_MALE_1995, name: 12345n, secret: 99n,
      currentDateInt: 20260601, currentYY: 26, minAge: 18, issuerPrivKey: ISSUER_PRIV,
    });
    const w = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(w);
  });

  it("rejects a minor (female record, born 2010, age < 18)", async () => {
    const { input } = await buildInput({
      nik: NIK_FEMALE_2010, name: 222n, secret: 7n,
      currentDateInt: 20260601, currentYY: 26, minAge: 18, issuerPrivKey: ISSUER_PRIV,
    });
    let threw = false;
    try { const w = await circuit.calculateWitness(input, true); await circuit.checkConstraints(w); }
    catch (e) { threw = true; }
    expect(threw).to.equal(true);
  });

  it("rejects a tampered NIK (signature no longer valid)", async () => {
    const { input } = await buildInput({
      nik: NIK_MALE_1995, name: 12345n, secret: 99n,
      currentDateInt: 20260601, currentYY: 26, minAge: 18, issuerPrivKey: ISSUER_PRIV,
    });
    input.nik[15] = "9"; // flip last digit after signing
    let threw = false;
    try { const w = await circuit.calculateWitness(input, true); await circuit.checkConstraints(w); }
    catch (e) { threw = true; }
    expect(threw).to.equal(true);
  });

  it("accepts a credential produced by the issuer module", async () => {
    const { createIssuer } = require("@kagehq/shared");
    const { buildPoseidon } = require("circomlibjs");
    const issuer = await createIssuer(ISSUER_PRIV);
    const poseidon = await buildPoseidon();
    const cred = await issuer.sign({ nik: NIK_MALE_1995, name: 12345n });
    const nikDigits = NIK_MALE_1995.split("");
    const scope = "777"; // eventId
    // Nullifier is now scoped: Poseidon(secret, scope), computed at prove time.
    const scopedNullifier = poseidon.F.toObject(
      poseidon([BigInt(cred.secret), BigInt(scope)])
    ).toString();
    const input = {
      nik: nikDigits, name: "12345", secret: cred.secret,
      Ax: cred.pubKey.Ax, Ay: cred.pubKey.Ay,
      R8x: cred.signature.R8x, R8y: cred.signature.R8y, S: cred.signature.S,
      currentDateInt: "20260601", currentYY: "26", minAge: "18",
      nullifierHash: scopedNullifier, scope,
    };
    const w = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(w);
  });

  it("binds the nullifier to scope: one identity, two events, two nullifiers", async () => {
    const common = {
      nik: NIK_MALE_1995, name: 12345n, secret: 99n,
      currentDateInt: 20260601, currentYY: 26, minAge: 18, issuerPrivKey: ISSUER_PRIV,
    };
    const a = await buildInput({ ...common, scope: 1001 }); // concert day 1
    const b = await buildInput({ ...common, scope: 1002 }); // concert day 2

    // Different scope -> different nullifier: day 2 is NOT a replay of day 1.
    expect(a.input.nullifierHash).to.not.equal(b.input.nullifierHash);

    // Both are valid proofs.
    await circuit.checkConstraints(await circuit.calculateWitness(a.input, true));
    await circuit.checkConstraints(await circuit.calculateWitness(b.input, true));

    // Same identity + same scope -> same nullifier: the on-chain PDA rejects the
    // second submission (double-entry at one event).
    const a2 = await buildInput({ ...common, scope: 1001 });
    expect(a.input.nullifierHash).to.equal(a2.input.nullifierHash);
  });

  it("rejects a forged scope/nullifier mismatch", async () => {
    const { input } = await buildInput({
      nik: NIK_MALE_1995, name: 12345n, secret: 99n, scope: 1001,
      currentDateInt: 20260601, currentYY: 26, minAge: 18, issuerPrivKey: ISSUER_PRIV,
    });
    input.scope = "2002"; // claim a different event without recomputing nullifier
    let threw = false;
    try { await circuit.checkConstraints(await circuit.calculateWitness(input, true)); }
    catch (e) { threw = true; }
    expect(threw).to.equal(true);
  });
});
