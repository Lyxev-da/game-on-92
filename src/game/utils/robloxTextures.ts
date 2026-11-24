import * as THREE from 'three';

/**
 * Generates the authentic Modern Roblox (2021+) Grey & White Baseplate texture.
 * 1024x1024 resolution representing a 16x16 stud major grid tile (64px per 1x1 stud).
 */
export function createModernBaseplateTexture(maxAnisotropy = 16): THREE.CanvasTexture {
  const size = 1024;
  const studsPerTile = 16;
  const studPx = size / studsPerTile; // 64px per stud

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 1. Base slate fill
  ctx.fillStyle = '#5C6068';
  ctx.fillRect(0, 0, size, size);

  // 2. Subtle 4x4 stud sub-block checkerboard contrast (signature of modern Roblox baseplate)
  const subBlockPx = studPx * 4; // 256px
  for (let bx = 0; bx < 4; bx++) {
    for (let by = 0; by < 4; by++) {
      const isEven = (bx + by) % 2 === 0;
      ctx.fillStyle = isEven ? '#60646C' : '#575B63';
      ctx.fillRect(bx * subBlockPx, by * subBlockPx, subBlockPx, subBlockPx);
    }
  }

  // 3. Individual 1x1 stud cells: subtle grid + circular Roblox stud impression
  for (let sx = 0; sx < studsPerTile; sx++) {
    for (let sy = 0; sy < studsPerTile; sy++) {
      const x = sx * studPx;
      const y = sy * studPx;
      const cx = x + studPx * 0.5;
      const cy = y + studPx * 0.5;
      const r = studPx * 0.25;

      // 1x1 cell hairline border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, studPx - 1, studPx - 1);

      // Subtle top-left bevel highlight on circular stud
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.75);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 1.75;
      ctx.stroke();

      // Subtle bottom-right shadow on circular stud
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 1.75, Math.PI * 0.75);
      ctx.strokeStyle = 'rgba(15, 18, 24, 0.16)';
      ctx.lineWidth = 1.75;
      ctx.stroke();

      // Very faint inner stud disc fill
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
      ctx.fill();
    }
  }

  // 4. Medium 4x4 stud sub-grid lines (#787C85 / crisp architectural lines)
  ctx.strokeStyle = 'rgba(218, 224, 235, 0.24)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const pos = i * subBlockPx;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  // 5. Major 16x16 stud outer boundary lines (Crisp White/Silver Modern Baseplate Grid)
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.62)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  // 6. Subtle architectural crosshairs at 4x4 sub-grid intersections
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  for (let bx = 1; bx < 4; bx++) {
    for (let by = 1; by < 4; by++) {
      const ix = bx * subBlockPx;
      const iy = by * subBlockPx;
      const tick = 8;
      ctx.beginPath();
      ctx.moveTo(ix - tick, iy);
      ctx.lineTo(ix + tick, iy);
      ctx.moveTo(ix, iy - tick);
      ctx.lineTo(ix, iy + tick);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates the iconic Roblox SpawnLocation pad top texture.
 */
export function createSpawnPadTexture(maxAnisotropy = 16): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark metallic slate background
  ctx.fillStyle = '#3A3D45';
  ctx.fillRect(0, 0, size, size);

  // Subtle stud grid on spawn pad
  const cells = 6;
  const cellPx = size / cells;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellPx, 0);
    ctx.lineTo(i * cellPx, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellPx);
    ctx.lineTo(size, i * cellPx);
    ctx.stroke();
  }

  // Outer frame border
  ctx.strokeStyle = '#D8DEE9';
  ctx.lineWidth = 12;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  // Inner dark ring
  const cx = size / 2;
  const cy = size / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, 175, 0, Math.PI * 2);
  ctx.fillStyle = '#2B2E36';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#E5E9F0';
  ctx.stroke();

  // Classic Roblox Spawn sun/vortex rays
  ctx.save();
  ctx.translate(cx, cy);
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    ctx.rotate((Math.PI * 2) / rays);
    ctx.beginPath();
    ctx.moveTo(58, -10);
    ctx.lineTo(148, -22);
    ctx.lineTo(132, 18);
    ctx.closePath();
    ctx.fillStyle = '#ECEFF4';
    ctx.fill();
  }
  ctx.restore();

  // Center circle emblem
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#ECEFF4';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#2B2E36';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates the classic Blocky Roblox R6 Yellow Head front face texture.
 */
export function createR6FaceTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Classic Bright Yellow Roblox Head base (#F5CD30)
  ctx.fillStyle = '#F5CD30';
  ctx.fillRect(0, 0, size, size);

  // Subtle plastic edge highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  // Classic Roblox Eyes (crisp dark charcoal ovals)
  ctx.fillStyle = '#18191C';

  // Left eye
  ctx.beginPath();
  ctx.roundRect(156, 165, 38, 66, 19);
  ctx.fill();

  // Right eye
  ctx.beginPath();
  ctx.roundRect(318, 165, 38, 66, 19);
  ctx.fill();

  // Tiny eye catchlights for crisp life
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(169, 182, 7, 0, Math.PI * 2);
  ctx.arc(331, 182, 7, 0, Math.PI * 2);
  ctx.fill();

  // Classic Roblox Smile arc
  ctx.strokeStyle = '#18191C';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(256, 248, 86, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * White-based stud texture for level parts. It is multiplied by each part's
 * brick color, so the molded stud circles and grid show up on any color.
 * One tile = 8x8 studs.
 */
export function createPartStudTexture(maxAnisotropy = 16): THREE.CanvasTexture {
  const size = 512;
  const cells = 8;
  const cell = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  for (let sx = 0; sx < cells; sx++) {
    for (let sy = 0; sy < cells; sy++) {
      const cx = sx * cell + cell / 2;
      const cy = sy * cell + cell / 2;
      const r = cell * 0.27;

      // Molded stud ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top-left catchlight
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, Math.PI * 0.8, Math.PI * 1.7);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Bottom-right shading
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, Math.PI * 1.8, Math.PI * 0.7);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Faint grid between studs
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.045)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates the Torso front texture for the R6 blocky avatar
 * in Electric Roblox Blue (#0D69AC) with subtle blocky shading.
 */
export function createR6TorsoFrontTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0D69AC';
  ctx.fillRect(0, 0, size, size);

  // Subtle collar / seam highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  // Subtle classic Roblox R-badge on upper left chest
  ctx.save();
  ctx.translate(365, 95);
  ctx.rotate(-0.18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fillRect(-26, -26, 52, 52);
  ctx.fillStyle = '#0D69AC';
  ctx.fillRect(-11, -11, 22, 22);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
