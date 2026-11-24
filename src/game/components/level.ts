// @ts-nocheck -- imported game code written for looser TS settings
import type { AABB, Ramp as PlayerRamp } from './PlayerController';

export interface LevelBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Base color. Auto-shaded per face like Roblox parts. */
  color: number;
  /** Optional flat accent color for the top face. */
  top?: number;
  /** Optional material name for procedural textures. */
  material?: 'brick' | 'concrete' | 'grass' | 'road' | 'wood' | 'metal' | 'roof' | 'checker' | 'sand' | 'water' | 'ice';
  /** Optional: disable shadows for performance on huge distant cliffs or decorative parts. */
  noShadow?: boolean;
  /** Ice surface: low friction & extra glide speed. */
  ice?: boolean;
  /** Bounce pad: landing on top launches the player upward with this speed. */
  bounce?: number;
}

export interface Ramp extends PlayerRamp {
  color?: number;
  material?: LevelBox['material'];
}

/**
 * Safe zone boundaries for Huss Valley crossings.
 * START is at the South end (z >= 170), FINISH is at the North end (z <= -170).
 */
export const VALLEY_BOUNDS = {
  MIN_X: -130,
  MAX_X: 130,
  MIN_Z: -220,
  MAX_Z: 220,
  START_LINE_Z: 170,
  FINISH_LINE_Z: -170,
} as const;

export const LEVEL_BOXES: LevelBox[] = [
  // ═══════════════ 1. START SAFE ZONE (South: z = 170..220) ═══════════════
  { x: 0, y: 0.2, z: 194, sx: 256, sy: 0.4, sz: 48, color: 0x54a85d, top: 0x67c46f, material: 'concrete' },
  // Checkered Goal Line Strip at z = 170
  { x: 0, y: 0.26, z: 170, sx: 256, sy: 0.52, sz: 6, color: 0xffffff, material: 'checker' },
  // START Gatehouse Archway
  { x: -16, y: 7, z: 172, sx: 4, sy: 14, sz: 4, color: 0xd9d4c7, material: 'concrete' },
  { x: 16, y: 7, z: 172, sx: 4, sy: 14, sz: 4, color: 0xd9d4c7, material: 'concrete' },
  { x: 0, y: 15, z: 172, sx: 38, sy: 3, sz: 5, color: 0x45a851, material: 'metal' },
  // Side Guard Towers at Start
  { x: -75, y: 5, z: 174, sx: 10, sy: 10, sz: 10, color: 0xa6abb2, material: 'brick' },
  { x: 75, y: 5, z: 174, sx: 10, sy: 10, sz: 10, color: 0xa6abb2, material: 'brick' },

  // ═══════════════ 2. FINISH SAFE ZONE (North: z = -220..-170) ═══════════════
  { x: 0, y: 0.2, z: -194, sx: 256, sy: 0.4, sz: 48, color: 0xebc246, top: 0xf5d76e, material: 'concrete' },
  // Checkered Finish Line Strip at z = -170
  { x: 0, y: 0.26, z: -170, sx: 256, sy: 0.52, sz: 6, color: 0xffffff, material: 'checker' },
  // FINISH Gatehouse Archway
  { x: -16, y: 8, z: -172, sx: 4, sy: 16, sz: 4, color: 0xd9d4c7, material: 'concrete' },
  { x: 16, y: 8, z: -172, sx: 4, sy: 16, sz: 4, color: 0xd9d4c7, material: 'concrete' },
  { x: 0, y: 17, z: -172, sx: 38, sy: 3, sz: 5, color: 0xf2b729, material: 'metal' },
  // Side Victory Towers
  { x: -75, y: 6, z: -174, sx: 10, sy: 12, sz: 10, color: 0xd9a832, material: 'brick' },
  { x: 75, y: 6, z: -174, sx: 10, sy: 12, sz: 10, color: 0xd9a832, material: 'brick' },

  // ═══════════════ 3. SOUTH HIGHWAY & BARRIERS (z = 100..135) ═══════════════
  { x: 0, y: 0.16, z: 118, sx: 256, sy: 0.32, sz: 28, color: 0x45484f, top: 0x4b4e57, material: 'road' },
  // Vaultable jersey barriers across the road (3 studs tall)
  { x: -45, y: 1.5, z: 118, sx: 20, sy: 3, sz: 3, color: 0xd1cfc7, material: 'concrete' },
  { x: -5, y: 1.5, z: 118, sx: 20, sy: 3, sz: 3, color: 0xd1cfc7, material: 'concrete' },
  { x: 35, y: 1.5, z: 118, sx: 20, sy: 3, sz: 3, color: 0xd1cfc7, material: 'concrete' },
  { x: 75, y: 1.5, z: 118, sx: 18, sy: 3, sz: 3, color: 0xd1cfc7, material: 'concrete' },
  // Highway sign gantry (slide under or jump onto top)
  { x: -25, y: 4.5, z: 106, sx: 2, sy: 9, sz: 2, color: 0x70757d, material: 'metal' },
  { x: 25, y: 4.5, z: 106, sx: 2, sy: 9, sz: 2, color: 0x70757d, material: 'metal' },
  { x: 0, y: 9.5, z: 106, sx: 56, sy: 3, sz: 3, color: 0x3b8747, material: 'metal' },
  // Low slide-under toll booth frame
  { x: 0, y: 3.8, z: 142, sx: 26, sy: 0.8, sz: 6, color: 0xd4483b, material: 'metal' },
  { x: -12, y: 1.9, z: 142, sx: 2, sy: 3.8, sz: 4, color: 0x9fa3aa, material: 'concrete' },
  { x: 12, y: 1.9, z: 142, sx: 2, sy: 3.8, sz: 4, color: 0x9fa3aa, material: 'concrete' },

  // ═══════════════ 4. CENTRAL VALLEY: THE RED BARN (x = -26, z = 0) ═══════════════
  // Left & Right barn walls leaving a wide 12-stud pass-through tunnel down the center
  { x: -38, y: 6, z: 0, sx: 8, sy: 12, sz: 34, color: 0xb03a2a, material: 'wood' },
  { x: -14, y: 6, z: 0, sx: 8, sy: 12, sz: 34, color: 0xb03a2a, material: 'wood' },
  // Barn roof & loft (high enough to sprint/slide right through)
  { x: -26, y: 13, z: 0, sx: 36, sy: 2, sz: 38, color: 0x5c3e2b, top: 0x473022, material: 'roof' },
  { x: -26, y: 15.5, z: 0, sx: 22, sy: 3, sz: 36, color: 0x6d4a34, material: 'roof' },
  // Hay bales (vaultable crates around the barn)
  { x: -26, y: 1.5, z: 22, sx: 4, sy: 3, sz: 4, color: 0xe3b946, material: 'wood' },
  { x: -20, y: 1.5, z: 24, sx: 4, sy: 3, sz: 4, color: 0xe3b946, material: 'wood' },
  { x: -26, y: 1.5, z: -22, sx: 4, sy: 3, sz: 4, color: 0xe3b946, material: 'wood' },
  { x: -46, y: 1.5, z: 8, sx: 4, sy: 3, sz: 4, color: 0xe3b946, material: 'wood' },
  { x: -46, y: 4.5, z: 8, sx: 4, sy: 3, sz: 4, color: 0xf0c954, material: 'wood' },

  // ═══════════════ 5. CENTRAL CANYON WALL-RUN ARENA (x = 24..46, z = -30..30) ═══════════════
  { x: 24, y: 8, z: 0, sx: 3, sy: 16, sz: 56, color: 0x9aa0a6, material: 'concrete' },
  { x: 42, y: 8, z: 0, sx: 3, sy: 16, sz: 56, color: 0x0d69ac, material: 'brick' },
  // Elevated bridge deck connecting the canyon tops
  { x: 33, y: 16.5, z: -22, sx: 20, sy: 1, sz: 10, color: 0x9e7b4f, material: 'wood' },
  { x: 33, y: 16.5, z: 22, sx: 20, sy: 1, sz: 10, color: 0x9e7b4f, material: 'wood' },
  // Central Fountain / Chaser Hub Monument (x = 6, z = 0)
  { x: 6, y: 1.5, z: 0, sx: 14, sy: 3, sz: 14, color: 0x8f949b, top: 0x8bc9f0, material: 'water' },
  { x: 6, y: 4, z: 0, sx: 4, sy: 5, sz: 4, color: 0xb0b5bc, material: 'concrete' },

  // ═══════════════ 6. VALLEY CREEK & BRIDGES (z = -56) ═══════════════
  { x: 0, y: 0.14, z: -56, sx: 256, sy: 0.28, sz: 18, color: 0x4ca6e8, top: 0x68bcf7, material: 'water' },
  // Three wooden bridges across the creek
  { x: -45, y: 1.2, z: -56, sx: 14, sy: 0.8, sz: 22, color: 0x8f663c, material: 'wood' },
  { x: 0, y: 1.2, z: -56, sx: 16, sy: 0.8, sz: 22, color: 0x8f663c, material: 'wood' },
  { x: 52, y: 1.2, z: -56, sx: 14, sy: 0.8, sz: 22, color: 0x8f663c, material: 'wood' },
  // Stepping stones across the water (bhop pads)
  { x: -22, y: 1.0, z: -56, sx: 5, sy: 2, sz: 5, color: 0x9ca1a8, material: 'concrete' },
  { x: 26, y: 1.0, z: -56, sx: 5, sy: 2, sz: 5, color: 0x9ca1a8, material: 'concrete' },

  // ═══════════════ 7. WEST FLANK: ICE SKATE LANE & FOREST (x = -118..-64) ═══════════════
  // Long gleaming Ice Skate Strip (z = -150..150) — huge Huss Valley speed lane!
  { x: -84, y: 0.2, z: 0, sx: 24, sy: 0.4, sz: 290, color: 0xa6e7ff, top: 0xc2f0ff, material: 'ice', ice: true },
  // Ice pillars / slalom rocks along the ice rink
  { x: -84, y: 3, z: 60, sx: 5, sy: 6, sz: 5, color: 0x7dbfe0, material: 'ice' },
  { x: -90, y: 3, z: 0, sx: 5, sy: 6, sz: 5, color: 0x7dbfe0, material: 'ice' },
  { x: -78, y: 3, z: -85, sx: 5, sy: 6, sz: 5, color: 0x7dbfe0, material: 'ice' },
  // Elevated wooden ridge & trees on far west
  { x: -112, y: 4, z: 40, sx: 16, sy: 8, sz: 46, color: 0x6c9a3e, top: 0x7fb04a, material: 'grass' },
  { x: -112, y: 4, z: -40, sx: 16, sy: 8, sz: 46, color: 0x6c9a3e, top: 0x7fb04a, material: 'grass' },
  // Tree trunks (colliders)
  { x: -64, y: 4, z: 80, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },
  { x: -62, y: 4, z: 25, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },
  { x: -64, y: 4, z: -30, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },
  { x: -62, y: 4, z: -110, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },
  { x: -108, y: 4, z: 120, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },
  { x: -108, y: 4, z: -120, sx: 3, sy: 8, sz: 3, color: 0x6b4a2b, material: 'wood' },

  // ═══════════════ 8. EAST FLANK: BRICK TOWN & CATWALKS (x = 68..118) ═══════════════
  // Yellow Brick Storefront (south-east)
  { x: 90, y: 6, z: 68, sx: 22, sy: 12, sz: 26, color: 0xf0c53a, top: 0xd9a832, material: 'brick' },
  { x: 90, y: 13, z: 68, sx: 24, sy: 2, sz: 28, color: 0xb87a22, material: 'roof' },
  { x: 78, y: 4.0, z: 68, sx: 2, sy: 0.6, sz: 20, color: 0xd94236, material: 'metal' },
  // Blue Brick Depot (north-east)
  { x: 90, y: 6, z: -90, sx: 22, sy: 12, sz: 26, color: 0x2b75b8, top: 0x1e5c96, material: 'brick' },
  { x: 90, y: 13, z: -90, sx: 24, sy: 2, sz: 28, color: 0x3b424d, material: 'roof' },
  // Elevated Catwalk & Wall-Run Fence connecting them
  { x: 68, y: 7, z: -12, sx: 3, sy: 14, sz: 74, color: 0xc9b489, material: 'brick' },
  { x: 98, y: 5, z: -12, sx: 14, sy: 10, sz: 36, color: 0x7d828a, material: 'concrete' },
  // Floating Parkour Pads down the East skyway
  { x: 90, y: 15, z: 25, sx: 8, sy: 1, sz: 8, color: 0xf5cd30, material: 'metal' },
  { x: 90, y: 16, z: -48, sx: 8, sy: 1, sz: 8, color: 0x5fb3e6, material: 'metal' },

  // ═══════════════ 9. NORTH CASTLE APPROACH (z = -140..-98) ═══════════════
  { x: -34, y: 7, z: -115, sx: 8, sy: 14, sz: 26, color: 0x9aa0a6, material: 'concrete' },
  { x: 34, y: 7, z: -115, sx: 8, sy: 14, sz: 26, color: 0x9aa0a6, material: 'concrete' },
  // Overhead castle bridge
  { x: 0, y: 11.5, z: -115, sx: 60, sy: 1.5, sz: 10, color: 0x8a9096, material: 'concrete' },
  // Low wall obstacles to vault in the final sprint
  { x: -16, y: 1.5, z: -145, sx: 12, sy: 3, sz: 3, color: 0xb5b0a6, material: 'concrete' },
  { x: 16, y: 1.5, z: -145, sx: 12, sy: 3, sz: 3, color: 0xb5b0a6, material: 'concrete' },
  { x: 0, y: 1.5, z: -90, sx: 16, sy: 3, sz: 3, color: 0xb5b0a6, material: 'concrete' },

  // ═══════════════ 10. VALLEY CLIFF PERIMETER ═══════════════
  { x: 0, y: 9, z: -222, sx: 264, sy: 18, sz: 4, color: 0x777d85, material: 'concrete' },
  { x: 0, y: 9, z: 222, sx: 264, sy: 18, sz: 4, color: 0x777d85, material: 'concrete' },
  { x: -132, y: 9, z: 0, sx: 4, sy: 18, sz: 444, color: 0x777d85, material: 'concrete' },
  { x: 132, y: 9, z: 0, sx: 4, sy: 18, sz: 444, color: 0x777d85, material: 'concrete' },

  // Distant scenic mountains outside the walls
  { x: -210, y: 28, z: -120, sx: 80, sy: 56, sz: 120, color: 0x6c7c8c, noShadow: true },
  { x: 220, y: 35, z: 40, sx: 90, sy: 70, sz: 140, color: 0x627385, noShadow: true },
  { x: 40, y: 32, z: -290, sx: 180, sy: 64, sz: 80, color: 0x6e8091, noShadow: true },
  { x: -60, y: 24, z: 295, sx: 160, sy: 48, sz: 80, color: 0x748596, noShadow: true },

  // ═══════════════ 11. GOOFY BOUNCE PADS (pink springs: land on top to launch) ═══════════════
  { x: -30, y: 0.4, z: 150, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 60 },
  { x: 30, y: 0.4, z: 150, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 60 },
  { x: -26, y: 0.4, z: 58, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 64 },
  { x: -60, y: 0.4, z: -100, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 64 },
  { x: 100, y: 0.4, z: 0, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 70 },
  { x: 60, y: 0.4, z: -170, sx: 7, sy: 0.8, sz: 7, color: 0xff6fd8, material: 'metal', bounce: 60 },
];

export const LEVEL_RAMPS: Ramp[] = [
  // Highway launch ramps (south -> north)
  { minX: -24, maxX: -12, minZ: 126, maxZ: 142, axis: 'z', y0: 5, y1: 0, color: 0xf5cd30, material: 'metal' },
  { minX: 12, maxX: 24, minZ: 126, maxZ: 142, axis: 'z', y0: 5, y1: 0, color: 0xf5cd30, material: 'metal' },
  // Creek bridge approach ramps (south side)
  { minX: -52, maxX: -38, minZ: -45, maxZ: -38, axis: 'z', y0: 1.2, y1: 0, color: 0x8f663c, material: 'wood' },
  { minX: -8, maxX: 8, minZ: -45, maxZ: -38, axis: 'z', y0: 1.2, y1: 0, color: 0x8f663c, material: 'wood' },
  { minX: 45, maxX: 59, minZ: -45, maxZ: -38, axis: 'z', y0: 1.2, y1: 0, color: 0x8f663c, material: 'wood' },
  // Creek bridge approach ramps (north side)
  { minX: -52, maxX: -38, minZ: -74, maxZ: -67, axis: 'z', y0: 0, y1: 1.2, color: 0x8f663c, material: 'wood' },
  { minX: -8, maxX: 8, minZ: -74, maxZ: -67, axis: 'z', y0: 0, y1: 1.2, color: 0x8f663c, material: 'wood' },
  { minX: 45, maxX: 59, minZ: -74, maxZ: -67, axis: 'z', y0: 0, y1: 1.2, color: 0x8f663c, material: 'wood' },
  // West ridge ramps
  { minX: -120, maxX: -104, minZ: 63, maxZ: 79, axis: 'z', y0: 8, y1: 0, color: 0x7fb04a, material: 'grass' },
  { minX: -120, maxX: -104, minZ: -79, maxZ: -63, axis: 'z', y0: 0, y1: 8, color: 0x7fb04a, material: 'grass' },
  // East catwalk ramps
  { minX: 91, maxX: 105, minZ: 6, maxZ: 24, axis: 'z', y0: 10, y1: 0, color: 0x9fa3aa, material: 'concrete' },
  { minX: 91, maxX: 105, minZ: -48, maxZ: -30, axis: 'z', y0: 0, y1: 10, color: 0x9fa3aa, material: 'concrete' },
  // North castle bridge ramp
  { minX: -20, maxX: -6, minZ: -110, maxZ: -86, axis: 'z', y0: 11.5, y1: 0, color: 0xc8c0b0, material: 'concrete' },
  { minX: 6, maxX: 20, minZ: -110, maxZ: -86, axis: 'z', y0: 11.5, y1: 0, color: 0xc8c0b0, material: 'concrete' },
];

export const TREE_LOCATIONS: Array<[number, number, number]> = [
  [-64, 80, 1.15],
  [-62, 25, 1.0],
  [-64, -30, 1.1],
  [-62, -110, 1.05],
  [-108, 120, 1.2],
  [-108, -120, 1.15],
];

export function levelToAABBs(boxes: LevelBox[] = LEVEL_BOXES): AABB[] {
  return boxes.map((box) => ({
    minX: box.x - box.sx / 2,
    maxX: box.x + box.sx / 2,
    minY: box.y - box.sy / 2,
    maxY: box.y + box.sy / 2,
    minZ: box.z - box.sz / 2,
    maxZ: box.z + box.sz / 2,
    ice: box.ice,
    bounce: box.bounce,
  }));
}
