// script.js
const fileInput = document.getElementById('fileInput');
const chooseBtn = document.getElementById('chooseBtn');
const uploadArea = document.getElementById('uploadArea');
const thumbList = document.getElementById('thumbList');
const convertBtn = document.getElementById('convertBtn');
const paperSizeEl = document.getElementById('paperSize');
const orientationEl = document.getElementById('orientation');
const fitModeEl = document.getElementById('fitMode');
const filenameEl = document.getElementById('filename');

let items = []; // {id, file, url, width, height}

chooseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

;['dragenter','dragover'].forEach(ev=>{
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    uploadArea.classList.add('dragging');
  });
});
;['dragleave','drop'].forEach(ev=>{
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    uploadArea.classList.remove('dragging');
  });
});

uploadArea.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
  handleFiles(files);
});

function handleFiles(files){
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if(!imageFiles.length) return;
  imageFiles.forEach(file => {
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const url = URL.createObjectURL(file);
    const item = {id, file, url, width:0, height:0};
    items.push(item);
    createThumb(item);
    // preload to read natural size
    const img = new Image();
    img.onload = () => {
      item.width = img.naturalWidth;
      item.height = img.naturalHeight;
    };
    img.src = url;
  });
}

function createThumb(item){
  const card = document.createElement('div');
  card.className = 'thumb';
  card.dataset.id = item.id;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove';
  removeBtn.title = 'Remove';
  removeBtn.textContent = '✕';
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    URL.revokeObjectURL(item.url);
    items = items.filter(i => i.id !== item.id);
    card.remove();
  };

  const img = document.createElement('img');
  img.src = item.url;
  img.alt = item.file.name;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = item.file.name;

  const actions = document.createElement('div');
  actions.className = 'actions';
  const up = document.createElement('button'); up.textContent = '↑';
  const down = document.createElement('button'); down.textContent = '↓';
  up.onclick = () => moveCard(item.id, -1);
  down.onclick = () => moveCard(item.id, 1);
  actions.appendChild(up);
  actions.appendChild(down);

  card.appendChild(removeBtn);
  card.appendChild(img);
  card.appendChild(label);
  card.appendChild(actions);

  thumbList.appendChild(card);
}

// move position without using external lib (buttons)
function moveCard(id, dir){
  const idx = items.findIndex(i => i.id === id);
  if(idx === -1) return;
  const newIdx = idx + dir;
  if(newIdx < 0 || newIdx >= items.length) return;
  const [it] = items.splice(idx, 1);
  items.splice(newIdx, 0, it);
  // re-render thumbnails in that order
  renderThumbs();
}

function renderThumbs(){
  thumbList.innerHTML = '';
  items.forEach(createThumb);
}

// Enable drag reordering with SortableJS for smoother UX
if(window.Sortable){
  Sortable.create(thumbList, {
    animation:150,
    onEnd:(evt)=>{
      const oldIndex = evt.oldIndex;
      const newIndex = evt.newIndex;
      if(oldIndex === newIndex) return;
      const moved = items.splice(oldIndex, 1)[0];
      items.splice(newIndex, 0, moved);
      renderThumbs(); // re-render to sync buttons and dataset
    }
  });
}

// Convert to PDF using pdf-lib
convertBtn.addEventListener('click', async () => {
  if(!items.length){ alert('Please add some images first.'); return; }
  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting...';

  try{
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    for(const item of items){
      // read file as array buffer
      const arrayBuffer = await item.file.arrayBuffer();
      // determine type and embed
      const isPng = item.file.type === 'image/png';
      const isJpeg = item.file.type === 'image/jpeg' || item.file.type === 'image/jpg';
      let embeddedImage;
      if(isPng){
        embeddedImage = await pdfDoc.embedPng(arrayBuffer);
      } else {
        // pdf-lib can embed jpeg from array buffer for common browsers
        embeddedImage = await pdfDoc.embedJpg(arrayBuffer).catch(async () => {
          // fallback: convert via canvas if embedJpg fails (e.g., webp). Create a canvas and get jpeg blob.
          const blobUrl = item.url;
          const img = await loadImage(blobUrl);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const b = dataUrlToArrayBuffer(dataUrl);
          embeddedImage = await pdfDoc.embedJpg(b);
        });
      }

      // page sizing
      let page;
      const useAuto = paperSizeEl.value === 'Auto';
      if(useAuto){
        const w = embeddedImage.width;
        const h = embeddedImage.height;
        page = pdfDoc.addPage([w, h]);
      } else {
        const orientation = orientationEl.value;
        const dims = getPaperSizePoints(paperSizeEl.value, orientation);
        page = pdfDoc.addPage(dims);
      }

      // place image with fit
      const { width: pw, height: ph } = page.getSize();
      const imgW = embeddedImage.width;
      const imgH = embeddedImage.height;

      if(fitModeEl.value === 'contain'){
        const scale = Math.min(pw / imgW, ph / imgH);
        const dw = imgW * scale;
        const dh = imgH * scale;
        const x = (pw - dw) / 2;
        const y = (ph - dh) / 2;
        page.drawImage(embeddedImage, { x, y, width: dw, height: dh });
      } else {
        // cover: scale to fill and crop center
        const scale = Math.max(pw / imgW, ph / imgH);
        const dw = imgW * scale;
        const dh = imgH * scale;
        const x = (pw - dw) / 2;
        const y = (ph - dh) / 2;
        page.drawImage(embeddedImage, { x, y, width: dw, height: dh });
      }
    }

    const pdfBytes = await pdfDoc.save();
    downloadBytes(pdfBytes, filenameEl.value || 'converted.pdf');
  } catch (err){
    console.error(err);
    alert('Error while creating PDF: ' + (err && err.message ? err.message : err));
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = 'Convert to PDF';
  }
});

function getPaperSizePoints(name, orientation){
  // sizes in points (1 pt = 1/72 in). Use common sizes: A4 and Letter
  if(name === 'A4'){
    // A4 = 210 x 297 mm -> in points
    const mmToPt = mm => mm * 2.83464567;
    let w = mmToPt(210), h = mmToPt(297);
    if(orientation === 'landscape') [w,h] = [h,w];
    return [w,h];
  }
  // Letter 8.5 x 11 in
  if(name === 'Letter'){
    let w = 8.5 * 72, h = 11 * 72;
    if(orientation === 'landscape') [w,h] = [h,w];
    return [w,h];
  }
  // fallback A4
  return [595, 842];
}

function downloadBytes(bytes, filename){
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'converted.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function loadImage(url){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

function dataUrlToArrayBuffer(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const len = binary.length;
  const buf = new Uint8Array(len);
  for(let i=0;i<len;i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}
