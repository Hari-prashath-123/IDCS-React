QR generation helper

This repository includes a small Node script to generate QR codes used by the gatepass scanner.

Prerequisites
- Node.js (v16+ recommended)

Install the helper dependency:

```powershell
cd "c:\Users\ABIVARSAN\Hash\NEW-IDCS"
npm install qrcode
```

Generate sample QR images:

```powershell
# Generate a QR containing the student id
node scripts/generate-qr.mjs "STUDENT123" public/qrs/student_STUDENT123.png

# Generate a QR that encodes the expected "out.jpg" token
node scripts/generate-qr.mjs "out.jpg" public/qrs/out.png

# Generate a QR that encodes the expected "in.jpg" token
node scripts/generate-qr.mjs "in.jpg" public/qrs/in.png
```

Notes
- The scanner accepts payloads that contain the student id, the words `in`/`out`, or the image filename (`in.jpg`/`out.jpg`). Use the payload style you prefer.
- The script writes PNG files; place them somewhere public (e.g. `public/qrs`) so you can open them on a phone for testing.

If you want, I can also add pre-generated sample PNGs into the repo — tell me which student id string you want embedded and I'll add the generated images here if you want me to produce them and commit them for you.