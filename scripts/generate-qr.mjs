import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

// Usage:
//  node scripts/generate-qr.mjs "payload" output.png
// Examples:
//  node scripts/generate-qr.mjs "STUDENT123" ./public/qrs/student_STUDENT123.png
//  node scripts/generate-qr.mjs "out.jpg" ./public/qrs/out.png

const [,, payload, outFile] = process.argv;
if (!payload || !outFile) {
  console.error('Usage: node scripts/generate-qr.mjs "payload" output.png');
  process.exit(2);
}

(async () => {
  try {
    const dir = path.dirname(outFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await QRCode.toFile(outFile, payload, {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 512
    });
    console.log('Wrote', outFile);
  } catch (err) {
    console.error('Error generating QR', err);
    process.exit(1);
  }
})();
