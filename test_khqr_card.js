const { createKhqrCard } = require('./khqr_card');

async function runTest() {
  const sampleQr = "00020101021229190015seyha_lome@bkrt520459995303840540115802KH5910PAY8BET1686010Phnom Penh6244011617922148623524050310PAY8BET1680706POS-0199340013179221486235201131792301262352630438A4";

  console.log("Generating pure USD Card...");
  const usdBuf = await createKhqrCard({
    merchantName: "PAY8BET168",
    amount: "1.00",
    currency: "USD",
    qrString: sampleQr
  });
  console.log("✅ USD-only Card generated! Size:", usdBuf.length, "bytes");

  console.log("Generating pure KHR Card...");
  const khrBuf = await createKhqrCard({
    merchantName: "PAY8BET168",
    amount: "4100",
    currency: "KHR",
    qrString: sampleQr
  });
  console.log("✅ KHR-only Card generated! Size:", khrBuf.length, "bytes");
}

runTest().catch(console.error);
