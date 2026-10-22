// TEMPORARY: switches off one suspect at a time to find what stutters the sheets' slide-in. Remove once found.
//   'photo'  — the destination sheet's header photo is not drawn
//   'shadow' — the destination and spot sheets draw no drop shadow
//   'pins'   — the map's spot and destination pin layers are hidden for 700 ms after a selection changes
//   'camera' — every camera move jumps instead of animating (the map does not fly while a sheet slides in)
export const BISECT: 'photo' | 'shadow' | 'pins' | 'camera' | null = 'camera';
