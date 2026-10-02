export type SiteNavLink = { href: string; label: string };

/** Primary site navigation, shared by the header (desktop + mobile) and the footer. */
export const SITE_NAV: readonly SiteNavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/design", label: "Design" },
  { href: "/gallery", label: "Gallery" },
  { href: "/stones", label: "Stones" },
  { href: "/pricing", label: "Pricing" },
];

export const SIGN_IN_HREF = "/login";
export const START_FREE_HREF = "/signup";
export const STUDIO_HREF = "/viewer/mist-solitaire";
export const DESIGN_HREF = "/design";
export const UPLOAD_HREF = "/upload-model";

export function isActiveNavLink(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
