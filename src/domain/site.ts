export type Rect = { x: number; y: number; w: number; h: number }

/** layout.png is 900x560 and one pixel is one unit, so map units are image pixels. */
export const SITE = {
  width: 900,
  height: 560,
  /** The recorded log never puts a robot closer than this to an edge. */
  margin: 5,
}

/**
 * Shelving and the central wall, traced off layout.png. The dashboard only needs
 * these to keep the generated live feed off the furniture; the drawn floor plan
 * is the image itself.
 */
export const OBSTACLES: Rect[] = [
  { x: 501, y: 61, w: 59, h: 399 },
  { x: 151, y: 81, w: 199, h: 59 },
  { x: 151, y: 221, w: 199, h: 59 },
  { x: 151, y: 361, w: 199, h: 59 },
  { x: 651, y: 151, w: 199, h: 49 },
  { x: 651, y: 341, w: 199, h: 49 },
]

/** Radius of a robot marker on the map, in site units. */
export const ROBOT_RADIUS = 8

/**
 * Clearance the live feed keeps from obstacles. The recorded log gets as close as
 * one unit, so it treats robots as points; matching that keeps generated paths
 * looking like the recorded ones.
 */
export const OBSTACLE_CLEARANCE = 2
