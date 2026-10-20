// The camera's live zoom, straight from the map's camera events, for components that must follow the camera without
// waiting for the (large) map screen to re-render. MapScreen writes it on every camera event; subscribers are called
// synchronously and decide for themselves whether anything they draw changed.
type Listener = (zoom: number) => void;
const listeners = new Set<Listener>();
export const cameraStore = {
  zoom: 0,
  set(zoom: number) {
    if (zoom === cameraStore.zoom) return;
    cameraStore.zoom = zoom;
    for (const l of listeners) l(zoom);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
