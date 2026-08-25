export type PrintSizeReport = {
  /** Modules across, quiet zone included. */
  span: number;
  /** Smallest usable side length in mm at the given scan distance. */
  minSideMm: number;
  /** Module pitch at that size, in mm. */
  minModuleMm: number;
  /** Comfortable side length — the number to actually print. */
  recommendedSideMm: number;
  /** Pixel width needed to print the recommended size at the given DPI. */
  recommendedPx: number;
};

/**
 * The industry rule is that a code reads at roughly ten times its own width,
 * so the side length needs to be about a tenth of the scan distance.
 *
 * That alone is not enough. It has to be checked against a floor on module
 * pitch: below about 0.4mm, ink spread on paper closes the gaps between modules
 * whatever the overall size says. Codes that fail in print usually fail here —
 * the code was sized for the distance, but the version was high enough that
 * individual modules fell under the printable floor.
 */
const ABSOLUTE_MIN_MODULE_MM = 0.4;
const COMFORTABLE_MODULE_MM = 0.6;
const DISTANCE_RATIO = 10;

export const printSize = (span: number, scanDistanceMm: number, dpi = 300): PrintSizeReport => {
  const byDistance = scanDistanceMm / DISTANCE_RATIO;
  const byModuleFloor = span * ABSOLUTE_MIN_MODULE_MM;
  const minSideMm = Math.max(byDistance, byModuleFloor);

  const recommendedSideMm = Math.max(minSideMm, span * COMFORTABLE_MODULE_MM);
  const recommendedPx = Math.ceil((recommendedSideMm / 25.4) * dpi);

  return {
    span,
    minSideMm: Math.round(minSideMm * 10) / 10,
    minModuleMm: Math.round((minSideMm / span) * 100) / 100,
    recommendedSideMm: Math.round(recommendedSideMm * 10) / 10,
    recommendedPx,
  };
};
