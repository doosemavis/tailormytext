// Screen tiers for the responsive layout (spec §4). responsive.css uses the
// same numbers; this file is the source of truth.
export const PHONE_MAX = 767;   // < 768 is phone
export const TABLET_MAX = 1023; // 768–1023 is tablet; ≥ 1024 is desktop
export const MQ_PHONE = `(max-width: ${PHONE_MAX}px)`;
export const MQ_TABLET_DOWN = `(max-width: ${TABLET_MAX}px)`;
export const MQ_TOUCH = "(pointer: coarse)";
