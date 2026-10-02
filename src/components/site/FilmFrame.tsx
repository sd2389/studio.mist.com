/** The film's grain over the page, and its viewfinder corners when `corners` is set. */
export function FilmFrame({ corners = true }: { corners?: boolean }) {
  return (
    <>
      <div aria-hidden className="site-grain" />
      {corners
        ? (["tl", "tr", "bl", "br"] as const).map((at) => <span key={at} aria-hidden className="site-corner" data-at={at} />)
        : null}
    </>
  );
}
