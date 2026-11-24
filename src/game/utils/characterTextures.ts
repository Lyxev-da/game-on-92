import * as THREE from 'three';

/**
 * Classic Roblox-style yellow face: glossy black capsule eyes, one raised brow,
 * rosy cheeks, and a lopsided open grin with teeth and a tongue.
 */
export function createGoofyFaceTexture(maxAnisotropy = 8): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const INK = '#141414';

  ctx.fillStyle = '#F5CD30';
  ctx.fillRect(0, 0, size, size);
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  shade.addColorStop(1, 'rgba(120, 80, 0, 0.08)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // Eyebrows: left relaxed, right raised for the goofy look
  ctx.fillStyle = INK;
  ctx.save();
  ctx.translate(170, 150);
  ctx.rotate(0.12);
  ctx.fillRect(-36, -7, 72, 14);
  ctx.restore();
  ctx.save();
  ctx.translate(342, 136);
  ctx.rotate(-0.28);
  ctx.fillRect(-36, -7, 72, 14);
  ctx.restore();

  // Eyes: tall capsules with two glints each
  for (const [cx, cy] of [[170, 214], [342, 214]]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(cx - 26, cy - 44, 52, 88, 26);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 12, cy + 16, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rosy cheeks
  ctx.fillStyle = 'rgba(255, 110, 130, 0.35)';
  ctx.beginPath();
  ctx.arc(116, 300, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(396, 300, 26, 0, Math.PI * 2);
  ctx.fill();

  // Open grin, lopsided: the right corner sits higher
  const mouth = new Path2D();
  mouth.moveTo(126, 282);
  mouth.quadraticCurveTo(256, 302, 388, 262);
  mouth.quadraticCurveTo(382, 398, 256, 392);
  mouth.quadraticCurveTo(132, 398, 126, 282);
  mouth.closePath();
  ctx.fillStyle = '#2A0A0E';
  ctx.fill(mouth);

  ctx.save();
  ctx.clip(mouth);
  ctx.fillStyle = '#E8577A';
  ctx.beginPath();
  ctx.ellipse(256, 362, 62, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(110, 240, 300, 46);
  ctx.strokeStyle = '#2A0A0E';
  ctx.lineWidth = 4;
  for (const x of [170, 214, 256, 298, 342]) {
    ctx.beginPath();
    ctx.moveTo(x, 240);
    ctx.lineTo(x, 290);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.stroke(mouth);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}
