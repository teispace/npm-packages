/**
 * Placeholder values for the sample payloads.
 *
 * Every content type ships a sample so the preview shows a real code the moment
 * a type is picked, rather than an empty frame. Those samples are visible to
 * every visitor and get copied into people's own codes, so they must never
 * carry real contact details.
 *
 * The rule: promotional identity is fine — the site's own name, website, and
 * public profile links are the point of hosting the tool. Anything a stranger
 * could contact or impersonate is not: no real organisation, job title, email
 * address, or phone number.
 *
 * Keeping them here rather than inline means the next content type added cannot
 * quietly reintroduce one.
 */

/** Promotional — the site's own identity, deliberately kept. */
export const EXAMPLE_NAME = { first: 'Krishna', last: 'Adhikari' };
export const EXAMPLE_SITE = 'https://krishna-adhikari.com.np';
export const EXAMPLE_CITY = 'Pokhara';
export const EXAMPLE_COUNTRY = 'Nepal';

/** Fictional — never a real, reachable contact. */
export const EXAMPLE_ORG = 'Example Studio';
export const EXAMPLE_TITLE = 'Product Designer';
/** `example.com` is reserved by RFC 2606 precisely for this. */
export const EXAMPLE_EMAIL = 'hello@example.com';
/** An obvious sequence, in the right shape for the locale but unallocated. */
export const EXAMPLE_PHONE = '+9779812345678';
