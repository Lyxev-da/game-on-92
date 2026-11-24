import * as THREE from 'three';

/** Procedural Roblox-style material textures. Each tiles seamlessly. */
export type MaterialName = NonNullable<import('../components/level').LevelBox['material']>;

const SIZE = 256;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return [canvas, canvas.getContext('2d')!];
}

function noise(ctx: CanvasRenderingContext2D, alpha: number, count = 1400): void {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2);
  }
}

function finish(canvas: HTMLCanvasElement, maxAnisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Classic Roblox stud top: a grid of round studs. */
function studs(ctx: CanvasRenderingContext2D, base: string, light: string, dark: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cell = SIZE / 4;
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      const cx = x * cell + cell / 2;
      const cy = y * cell + cell / 2;
      const r = cell * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy + 1.5, r, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = light;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
    }
  }
}

/**
 * Textures are authored as bright near-white values so the material's `color`
 * tint (the Roblox brick color) is what you actually see. Authoring the tint
 * into the texture too would square it and render buildings nearly black.
 */
export function createMaterialTexture(name: MaterialName, maxAnisotropy: number, _tint = 0xffffff): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();
  const hex = (mul: number, add = 0) => {
    const v = Math.min(255, Math.max(0, 236 * mul + add));
    return `rgb(${v | 0},${v | 0},${v | 0})`;
  };

  switch (name) {
    case 'brick': {
      ctx.fillStyle = hex(0.85);
      ctx.fillRect(0, 0, SIZE, SIZE);
      const bh = SIZE / 8;
      const bw = SIZE / 4;
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? bw / 2 : 0;
        for (let col = -1; col < 5; col++) {
          ctx.fillStyle = hex(1 + (Math.random() - 0.5) * 0.14);
          ctx.fillRect(col * bw + offset + 2, row * bh + 2, bw - 4, bh - 4);
        }
      }
      noise(ctx, 0.08, 900);
      break;
    }
    case 'concrete': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      noise(ctx, 0.1, 2600);
      // Subtle panel seams on the tile edges only (tiles cleanly)
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
      break;
    }
    case 'grass': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},${Math.random() * 0.1})`;
        ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 3, 3);
      }
      noise(ctx, 0.08, 700);
      break;
    }
    case 'wood': {
      ctx.fillStyle = hex(0.9);
      ctx.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.08})`;
        ctx.fillRect(0, (i * SIZE) / 6, SIZE, 3);
      }
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(0, Math.random() * SIZE, SIZE, 1);
      }
      break;
    }
    case 'metal': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo((i * SIZE) / 4, 0);
        ctx.lineTo((i * SIZE) / 4, SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (i * SIZE) / 4);
        ctx.lineTo(SIZE, (i * SIZE) / 4);
        ctx.stroke();
      }
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.beginPath();
          ctx.arc(x * (SIZE / 4) + 6, y * (SIZE / 4) + 6, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fill();
        }
      }
      break;
    }
    case 'roof': {
      ctx.fillStyle = hex(0.8);
      ctx.fillRect(0, 0, SIZE, SIZE);
      const rh = SIZE / 6;
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          ctx.fillStyle = hex(1.05 + (Math.random() - 0.5) * 0.1);
          ctx.beginPath();
          ctx.arc(col * (SIZE / 6) + SIZE / 12, row * rh + rh, SIZE / 12, Math.PI, 0);
          ctx.fill();
        }
      }
      break;
    }
    case 'checker': {
      const cell = SIZE / 4;
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.fillStyle = (x + y) % 2 ? '#222' : '#eee';
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      break;
    }
    case 'sand': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      noise(ctx, 0.1, 3000);
      break;
    }
    case 'water': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        for (let x = 0; x <= SIZE; x += 8) {
          const y = (i * SIZE) / 7 + Math.sin(x / 18 + i) * 5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'road': {
      ctx.fillStyle = hex(0.95);
      ctx.fillRect(0, 0, SIZE, SIZE);
      noise(ctx, 0.08, 2200);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(SIZE * 0.47, 16, SIZE * 0.06, SIZE * 0.36);
      ctx.fillRect(SIZE * 0.47, SIZE * 0.62, SIZE * 0.06, SIZE * 0.36);
      break;
    }
    case 'ice': {
      ctx.fillStyle = hex(1);
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const x0 = Math.random() * SIZE;
        const y0 = Math.random() * SIZE;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 38, y0 + 26);
        ctx.stroke();
      }
      break;
    }
    default: {
      studs(ctx, hex(1), hex(1.12), hex(0.8));
    }
  }
  return finish(canvas, maxAnisotropy);
}

/** Classic Roblox stud top for the baseplate, in modern light grey. */
export function createBaseplateTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas();
  ctx.fillStyle = '#6c7078';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cell = SIZE / 4;
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      const cx = x * cell + cell / 2;
      const cy = y * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy + 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#777b84';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 4, cell * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * SIZE) / 4, 0);
    ctx.lineTo((i * SIZE) / 4, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i * SIZE) / 4);
    ctx.lineTo(SIZE, (i * SIZE) / 4);
    ctx.stroke();
  }
  return finish(canvas, maxAnisotropy);
}
