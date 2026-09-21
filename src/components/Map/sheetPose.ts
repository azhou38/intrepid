// Where the currently shown sliding sheet (country / destination / spot) rests, so that a sheet replacing another
// one can start from there instead of from below the screen.
//
// The three sheets are separate components, so moving between levels (country -> destination -> spot and back) is
// an unmount of one and a mount of the next. A freshly mounted sheet starts off-screen (CLOSE_POS) and slides in,
// so a level change while a sheet was showing read as that sheet vanishing (the back pill, which belongs to the
// parent, stays put) and a new one shooting up from the bottom of the screen. The outgoing sheet leaves its resting
// position here on every snap; a sheet the parent says is replacing another starts from it. A sheet that closes
// (its exit slide, or a drag-dismiss) or rests at full screen clears it, so those keep their existing animations.
let restingY: number | null = null;

export const sheetPose = {
  set(y: number | null) { restingY = y; },
  get() { return restingY; },
};
