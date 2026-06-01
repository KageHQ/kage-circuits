const path = require("path");
const { expect } = require("chai");
const wasm_tester = require("circom_tester").wasm;
const { buildInput } = require("./helpers");

const ISSUER_PRIV = Buffer.from(
  "0001020304050607080900010203040506070809000102030405060708090001", "hex");

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
    const { createIssuer } = require("../../issuer/src/credential");
    const issuer = await createIssuer(ISSUER_PRIV);
    const cred = await issuer.sign({ nik: NIK_MALE_1995, name: 12345n });
    const nikDigits = NIK_MALE_1995.split("");
    const input = {
      nik: nikDigits, name: "12345", secret: cred.secret,
      Ax: cred.pubKey.Ax, Ay: cred.pubKey.Ay,
      R8x: cred.signature.R8x, R8y: cred.signature.R8y, S: cred.signature.S,
      currentDateInt: "20260601", currentYY: "26", minAge: "18",
      nullifierHash: cred.nullifierHash,
    };
    const w = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(w);
  });
});
