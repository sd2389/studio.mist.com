/** Where a visitor's theme choice is kept in this browser. */
export const FILM_THEME_STORAGE_KEY = "mist-film-theme";

/**
 * Routes that keep the neutral light look whatever the visitor chose: embeds live inside
 * customers' own sites, and the render harness feeds the golden-image tests.
 */
export const LIGHT_ONLY_PATHS = ["/embed", "/render-harness"];

/**
 * Runs inline in the root layout before the page paints: applies the visitor's theme
 * (their choice, else their system setting) to `<html>` — the `dark` class every token
 * keys off, plus `data-film-theme` — so no page flashes the wrong look while React loads.
 * Plain module, so the server layout can inline it.
 */
export const FILM_THEME_SCRIPT = `try{var t=localStorage.getItem("${FILM_THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var p=location.pathname;if(${JSON.stringify(LIGHT_ONLY_PATHS)}.some(function(r){return p===r||p.indexOf(r+"/")===0}))t="light";var d=document.documentElement;d.setAttribute("data-film-theme",t);d.classList.toggle("dark",t==="dark")}catch(e){}`;
