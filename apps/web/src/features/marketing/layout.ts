/*
 * The marketing pages' one container and section rhythm, so every section, the header and the
 * footer share the same left edge: 1120px of content, with 24px of side padding on phones and
 * 32px from tablets up.
 */

export const CONTAINER = 'mx-auto w-full max-w-[1184px] px-6 md:px-8';

/**
 * Space above a landing section: 64px on phones, 96px on tablets, 128px on desktops. Only above,
 * so sections that follow each other are one gap apart; `SECTION_END` closes a band.
 */
export const SECTION_Y = 'pt-16 md:pt-24 lg:pt-32';
export const SECTION_END = 'pb-16 md:pb-24 lg:pb-32';

/** A section's heading and its one line underneath. */
export const SECTION_TITLE = 'text-24 font-semibold tracking-tighter text-balance md:text-32';
export const SECTION_LEAD = 'mt-3 max-w-[560px] text-16 text-muted-foreground';
