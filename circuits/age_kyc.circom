pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";

template Mux() {
    signal input a;
    signal input b;
    signal input sel;   // 0 or 1
    signal output out;
    out <== a + sel * (b - a);
}

template AgeKYC() {
    signal input nik[16];   // digits, MSB-first
    signal input name;
    signal input secret;
    signal input R8x;
    signal input R8y;
    signal input S;
    signal input Ax;
    signal input Ay;
    signal input currentDateInt; // YYYYMMDD
    signal input currentYY;      // 2-digit current year
    signal input minAge;
    signal input nullifierHash;

    // (1) each NIK digit < 10
    component digitLt[16];
    for (var i = 0; i < 16; i++) {
        digitLt[i] = LessThan(4);
        digitLt[i].in[0] <== nik[i];
        digitLt[i].in[1] <== 10;
        digitLt[i].out === 1;
    }

    // nikField MSB-first
    signal nikAcc[17];
    nikAcc[0] <== 0;
    for (var i = 0; i < 16; i++) { nikAcc[i + 1] <== nikAcc[i] * 10 + nik[i]; }
    signal nikField;
    nikField <== nikAcc[16];

    // (2) EdDSA-Poseidon over Poseidon(nikField, name, secret)
    component msgHash = Poseidon(3);
    msgHash.inputs[0] <== nikField;
    msgHash.inputs[1] <== name;
    msgHash.inputs[2] <== secret;

    component sig = EdDSAPoseidonVerifier();
    sig.enabled <== 1;
    sig.Ax <== Ax; sig.Ay <== Ay;
    sig.R8x <== R8x; sig.R8y <== R8y; sig.S <== S;
    sig.M <== msgHash.out;

    // (3) derive birthdate
    signal ddRaw; ddRaw <== nik[6] * 10 + nik[7];
    signal mm;    mm <== nik[8] * 10 + nik[9];
    signal yy;    yy <== nik[10] * 10 + nik[11];

    component isFemale = GreaterThan(7);
    isFemale.in[0] <== ddRaw; isFemale.in[1] <== 40;
    signal dd; dd <== ddRaw - 40 * isFemale.out;

    component yyLe = LessEqThan(7);
    yyLe.in[0] <== yy; yyLe.in[1] <== currentYY;
    component century = Mux();
    century.a <== 1900; century.b <== 2000; century.sel <== yyLe.out;
    signal birthYear; birthYear <== century.out + yy;

    signal birthDateInt; birthDateInt <== birthYear * 10000 + mm * 100 + dd;

    signal thresholdDate; thresholdDate <== birthDateInt + minAge * 10000;
    component ageOk = GreaterEqThan(32);
    ageOk.in[0] <== currentDateInt; ageOk.in[1] <== thresholdDate;
    ageOk.out === 1;

    // (4) nullifier
    component nh = Poseidon(1);
    nh.inputs[0] <== secret;
    nh.out === nullifierHash;
}

component main { public [ Ax, Ay, currentDateInt, currentYY, minAge, nullifierHash ] } = AgeKYC();
