// Minimal, checked-in re-export. The actual handler (with every @anclora/*
// workspace package bundled in) is generated at build time by
// scripts/build-vercel-handler.mjs into ./_handler.mjs — a gitignored build
// artifact, not committed. This file must never import anything from
// @anclora/* or from ../src, so Vercel's own dependency tracer only ever
// needs to resolve one plain relative sibling import within this directory.
export { default } from './_handler.mjs';
