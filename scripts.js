const fileInput = document.getElementById('images');
const convertBtn = document.getElementById('convertBtn');

let items = [];

fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return;
  items = imageFiles.map(file => ({ file }));
}

convertBtn.addEventListener('click', async () => {
  if (!items.length) {
    alert('Please select at least one image.');
    return;
  }

  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting...';

  try {
    const { PDFDocument, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    const brandText = document.getElementById('brandText').value.trim();
    const brandLogoFile = document.getElementById('brandLogo').files[0];
    const compressionLevel = parseFloat(document.getElementById('compressionLevel').value);

    let brandLogoImg;
    if (brandLogoFile) {
      const logoArrayBuffer = await brandLogoFile.arrayBuffer();
      if (brandLogoFile.type === 'image/png') {
        brandLogoImg = await pdfDoc.embedPng(logoArrayBuffer);
      } else {
        brandLogoImg = await pdfDoc.embedJpg(logoArrayBuffer);
      }
    }

    for (const item of items) {
      // Load and compress image
      const img = await loadImage(URL.createObjectURL(item.file));
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * compressionLevel;
      canvas.height = img.naturalHeight * compressionLevel;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', compressionLevel);
      const compressedBuffer = dataUrlToArrayBuffer(compressedDataUrl);

      const embeddedImage = await pdfDoc.embedJpg(compressedBuffer);

      // Create page
      const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
      page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });

      // Draw branding logo
      if (brandLogoImg) {
        const logoWidth = 80;
        const logoHeight = (brandLogoImg.height / brandLogoImg.width) * logoWidth;
        page.drawImage(brandLogoImg, {
          x: page.getWidth() - logoWidth - 20,
          y: page.getHeight() - logoHeight - 20,
          width: logoWidth,
          height: logoHeight
        });
      }

      // Draw branding text
      if (brandText) {
        page.drawText(brandText, {
          x: 20,
          y: 20,
          size: 18,
          color: rgb(0.5, 0.5, 0.5)
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    downloadBytes(pdfBytes, 'r_i_m.pdf');

  } catch (err) {
    console.error(err);
    alert('Error creating PDF: ' + err.message);
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = 'Convert to PDF';
  }
});

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const len = binary.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
