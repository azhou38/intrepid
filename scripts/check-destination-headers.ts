// Offline check that every destination has a hand-picked header image (see
// scripts/destination-header-policy.ts and AGENTS.md, "Destination header images"). Needs no network:
//   npx tsx scripts/check-destination-headers.ts
// build-image-manifest.ts runs the same check first, so a destination without a curated header can't
// get into the manifest unnoticed.

import { checkCuratedHeaders } from './destination-header-policy';

const { errors, warnings } = checkCuratedHeaders();
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(`Destination headers OK${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}.`);
