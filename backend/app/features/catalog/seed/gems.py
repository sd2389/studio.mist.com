"""Gem seed entries.

Base IOR / dispersion values mirror the renderer's gemology-accurate configs.
Color variants change only the absorption colors (physically how fancy colors
differ from a colorless base of the same species). Cabochon and opaque stones
drop transmission/dispersion and raise roughness.
"""

from typing import Any


def _gem(
    slug: str,
    label: str,
    family: str,
    base_color: str,
    attenuation_color: str,
    *,
    ior: float,
    dispersion_base: float,
    dispersion_amplitude: float,
    roughness: float = 0.02,
    env: float = 1.5,
    attenuation_distance: float = 0.45,
    transmission: float | None = None,
    iridescence: float | None = None,
    clearcoat: float | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "ior": ior,
        "dispersionBase": dispersion_base,
        "dispersionAmplitude": dispersion_amplitude,
        "roughness": roughness,
        "thickness": 0.55,
        "envMapIntensity": env,
        "baseColor": base_color,
        "attenuationColor": attenuation_color,
        "attenuationDistance": attenuation_distance,
    }
    if transmission is not None:
        params["transmission"] = transmission
    if iridescence is not None:
        params["iridescence"] = iridescence
    if clearcoat is not None:
        params["clearcoat"] = clearcoat
    return {"slug": slug, "label": label, "gem_family": family, "params": params}


def _diamond(slug: str, label: str, base: str, atten: str, dist: float = 0.45) -> dict[str, Any]:
    return _gem(
        slug, label, "diamond", base, atten,
        ior=2.417, dispersion_base=0.08, dispersion_amplitude=0.035,
        env=1.6, attenuation_distance=dist, clearcoat=0.6,
    )


def _cabochon(slug: str, label: str, base: str, atten: str) -> dict[str, Any]:
    return _gem(
        slug, label, "cabochon", base, atten,
        ior=1.55, dispersion_base=0.0, dispersion_amplitude=0.0,
        roughness=0.12, env=1.1, attenuation_distance=0.25,
        transmission=0.2,
    )


def _opaque(slug: str, label: str, base: str) -> dict[str, Any]:
    return _gem(
        slug, label, "opaque", base, base,
        ior=1.5, dispersion_base=0.0, dispersion_amplitude=0.0,
        roughness=0.25, env=1.0, attenuation_distance=0.1,
        transmission=0.0,
    )


GEMS: list[dict[str, Any]] = [
    # Diamond + colorless/fancy grades
    _diamond("diamond", "Diamond", "#ffffff", "#ffffff", 0.40),
    _diamond("diamond-d-colorless", "Diamond D (Colorless)", "#ffffff", "#ffffff", 0.40),
    _diamond("diamond-h-nearcolorless", "Diamond H (Near Colorless)", "#fdfdfb", "#fbfbf5", 0.42),
    _diamond("diamond-k-faintyellow", "Diamond K (Faint Yellow)", "#fff8e6", "#fff0cc", 0.45),
    _diamond("diamond-p-verylightyellow", "Diamond P (Very Light Yellow)", "#fff2cc", "#ffe8a8", 0.5),
    _diamond("diamond-t-lightyellow", "Diamond T (Light Yellow)", "#ffeeb3", "#ffe08a", 0.5),
    _diamond("diamond-canary", "Canary Diamond", "#FFE066", "#FFDB4D", 0.45),
    _diamond("diamond-pink", "Pink Diamond", "#FFB1C8", "#FF80AB", 0.50),
    _diamond("diamond-blue", "Blue Diamond", "#88BFE0", "#4FA3D1", 0.50),
    _diamond("diamond-green", "Green Diamond", "#BFE6C2", "#8FD49A", 0.50),
    _diamond("diamond-cognac", "Cognac Diamond", "#8E5A2B", "#6B3F1E", 0.35),
    _diamond("diamond-champagne", "Champagne Diamond", "#E8C68A", "#D9B26E", 0.50),
    _gem("diamond-black", "Black Diamond", "diamond", "#1a1a1a", "#0a0a0a",
         ior=2.417, dispersion_base=0.05, dispersion_amplitude=0.02,
         roughness=0.06, env=1.4, attenuation_distance=0.15, clearcoat=0.7),
    _gem("moissanite", "Moissanite", "moissanite", "#ffffff", "#fbfaf5",
         ior=2.65, dispersion_base=0.12, dispersion_amplitude=0.05,
         env=1.7, attenuation_distance=0.40, clearcoat=0.7),
    # Corundum (ruby / sapphire family)
    _gem("ruby", "Ruby", "ruby", "#E0115F", "#FF1F5A",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("sapphire", "Blue Sapphire", "sapphire", "#0F52BA", "#1E3FFF",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("sapphire-pink", "Pink Sapphire", "sapphire", "#E58FB0", "#FF7FB0",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("sapphire-yellow", "Yellow Sapphire", "sapphire", "#E9C84A", "#FFD96B",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("sapphire-green", "Green Sapphire", "sapphire", "#4FAE84", "#6BD1A0",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("sapphire-padparadscha", "Padparadscha Sapphire", "sapphire", "#FF9E76", "#FFB893",
         ior=1.77, dispersion_base=0.025, dispersion_amplitude=0.01, clearcoat=0.4),
    _gem("spinel", "Spinel", "spinel", "#FF3F4E", "#FF5A6A",
         ior=1.72, dispersion_base=0.026, dispersion_amplitude=0.01,
         attenuation_distance=0.5, clearcoat=0.35),
    _gem("tanzanite", "Tanzanite", "tanzanite", "#4B3FA7", "#7958FF",
         ior=1.70, dispersion_base=0.034, dispersion_amplitude=0.012,
         attenuation_distance=0.5, clearcoat=0.3),
    # Garnet family
    _gem("garnet-tsavorite", "Tsavorite Garnet", "garnet", "#1FAE5A", "#2BD16A",
         ior=1.74, dispersion_base=0.031, dispersion_amplitude=0.012,
         attenuation_distance=0.5, clearcoat=0.3),
    _gem("garnet-almandine", "Almandine Garnet", "garnet", "#7A1F2D", "#A82037",
         ior=1.79, dispersion_base=0.028, dispersion_amplitude=0.01,
         attenuation_distance=0.5, clearcoat=0.3),
    _gem("garnet-rhodolite", "Rhodolite Garnet", "garnet", "#9B2D52", "#C13E6E",
         ior=1.76, dispersion_base=0.028, dispersion_amplitude=0.01,
         attenuation_distance=0.5, clearcoat=0.3),
    _gem("peridot", "Peridot", "peridot", "#9FCC2D", "#C6E663",
         ior=1.66, dispersion_base=0.024, dispersion_amplitude=0.009,
         env=1.4, attenuation_distance=0.55),
    _gem("topaz-blue", "Blue Topaz", "topaz", "#88D8E0", "#B6ECF0",
         ior=1.62, dispersion_base=0.018, dispersion_amplitude=0.008,
         env=1.4, attenuation_distance=0.6),
    # Tourmaline
    _gem("tourmaline", "Pink Tourmaline", "tourmaline", "#FF49A0", "#FF6FB7",
         ior=1.62, dispersion_base=0.021, dispersion_amplitude=0.009,
         env=1.4, attenuation_distance=0.55),
    _gem("tourmaline-green", "Green Tourmaline", "tourmaline", "#3FAE5A", "#6BD17F",
         ior=1.62, dispersion_base=0.021, dispersion_amplitude=0.009,
         env=1.4, attenuation_distance=0.55),
    _gem("tourmaline-rubellite", "Rubellite Tourmaline", "tourmaline", "#E0245E", "#FF4E80",
         ior=1.62, dispersion_base=0.021, dispersion_amplitude=0.009,
         env=1.4, attenuation_distance=0.55),
    # Beryl (aquamarine / emerald / morganite)
    _gem("aquamarine", "Aquamarine", "beryl", "#7FE0E8", "#BFEFF3",
         ior=1.58, dispersion_base=0.017, dispersion_amplitude=0.007,
         env=1.4, attenuation_distance=0.65),
    _gem("emerald", "Emerald", "beryl", "#1ABC57", "#7FDBA7",
         ior=1.58, dispersion_base=0.02, dispersion_amplitude=0.008,
         roughness=0.03, env=1.35, attenuation_distance=0.5),
    _gem("morganite", "Morganite", "beryl", "#FFCBC4", "#FFE4DD",
         ior=1.58, dispersion_base=0.017, dispersion_amplitude=0.007,
         env=1.4, attenuation_distance=0.7),
    # Quartz family
    _gem("amethyst", "Amethyst", "quartz", "#9966CC", "#B388E6",
         ior=1.55, dispersion_base=0.016, dispersion_amplitude=0.007,
         env=1.4, attenuation_distance=0.55),
    _gem("citrine", "Citrine", "quartz", "#E4C04A", "#FFE08A",
         ior=1.55, dispersion_base=0.016, dispersion_amplitude=0.007,
         env=1.4, attenuation_distance=0.6),
    _gem("quartz-smoky", "Smoky Quartz", "quartz", "#6B4E36", "#8A6A4A",
         ior=1.55, dispersion_base=0.016, dispersion_amplitude=0.007,
         env=1.3, attenuation_distance=0.4),
    _gem("quartz-rose", "Rose Quartz", "quartz", "#F4B8C4", "#FAD2DA",
         ior=1.55, dispersion_base=0.016, dispersion_amplitude=0.007,
         env=1.3, attenuation_distance=0.5, transmission=0.7),
    # Zircon (colorless base + fancy colors)
    _gem("zircon", "White Zircon", "zircon", "#ffffff", "#f0f4ff",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    _gem("zircon-blue", "Blue Zircon", "zircon", "#5FC8E0", "#8FE0F0",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    _gem("zircon-green", "Green Zircon", "zircon", "#6FBE5A", "#9FD98A",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    _gem("zircon-red", "Red Zircon", "zircon", "#C0392B", "#E0594B",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    _gem("zircon-yellow", "Yellow Zircon", "zircon", "#E9C84A", "#FFD96B",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    _gem("zircon-brown", "Brown Zircon", "zircon", "#8A5E3C", "#A87E5A",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.4),
    _gem("zircon-cinnamon", "Cinnamon Zircon", "zircon", "#B5642C", "#D9854B",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.4),
    _gem("zircon-turquoise", "Turquoise Zircon", "zircon", "#40C4B0", "#6FE0CE",
         ior=1.93, dispersion_base=0.045, dispersion_amplitude=0.015, attenuation_distance=0.45),
    # Soft / organic
    _gem("opal", "Opal", "opal", "#F5F0E6", "#FFE9D6",
         ior=1.45, dispersion_base=0.025, dispersion_amplitude=0.015,
         roughness=0.18, env=1.3, attenuation_distance=0.4, transmission=0.5, iridescence=0.9),
    _gem("jade", "Jade", "jade", "#52B788", "#74C69D",
         ior=1.66, dispersion_base=0.014, dispersion_amplitude=0.006,
         roughness=0.18, env=1.1, attenuation_distance=0.35, transmission=0.55),
    _gem("pearl", "Pearl", "pearl", "#F8F1E6", "#FFFAF0",
         ior=1.53, dispersion_base=0.012, dispersion_amplitude=0.005,
         roughness=0.35, env=1.0, attenuation_distance=0.3, transmission=0.0, iridescence=0.7),
    # Cabochon (opaque-ish domed cuts, no fire)
    _cabochon("cabochon-amethyst", "Amethyst Cabochon", "#9966CC", "#B388E6"),
    _cabochon("cabochon-emerald", "Emerald Cabochon", "#1ABC57", "#7FDBA7"),
    _cabochon("cabochon-ruby", "Ruby Cabochon", "#E0115F", "#FF1F5A"),
    _cabochon("cabochon-sapphire", "Sapphire Cabochon", "#0F52BA", "#1E3FFF"),
    _cabochon("cabochon-sapphire-yellow", "Yellow Sapphire Cabochon", "#E9C84A", "#FFD96B"),
    _cabochon("cabochon-topaz", "Topaz Cabochon", "#88D8E0", "#B6ECF0"),
    # Opaque ornamental stones
    _opaque("onyx-black", "Black Onyx", "#0E0E10"),
    _opaque("lapis-lazuli", "Lapis Lazuli", "#26418F"),
    _opaque("turquoise", "Turquoise", "#40C4B0"),
    _opaque("malachite", "Malachite", "#1F6E5A"),
    # Expanded gem families (beat Gemora's 58)
    _gem("spinel-blue", "Blue Spinel", "spinel", "#3A6AD0", "#5A8AF0",
         ior=1.72, dispersion_base=0.026, dispersion_amplitude=0.01,
         attenuation_distance=0.5, clearcoat=0.35),
    _gem("spinel-black", "Black Spinel", "spinel", "#1A1A1E", "#0A0A0C",
         ior=1.72, dispersion_base=0.02, dispersion_amplitude=0.008,
         roughness=0.04, env=1.3, attenuation_distance=0.2, clearcoat=0.5),
    _gem("alexandrite", "Alexandrite", "chrysoberyl", "#4A8A6A", "#6AB08A",
         ior=1.75, dispersion_base=0.028, dispersion_amplitude=0.012,
         env=1.45, attenuation_distance=0.5, clearcoat=0.35),
    _gem("chrysoberyl", "Chrysoberyl", "chrysoberyl", "#D8E060", "#E8F080",
         ior=1.75, dispersion_base=0.028, dispersion_amplitude=0.012,
         env=1.45, attenuation_distance=0.55, clearcoat=0.3),
    _gem("kunzite", "Kunzite", "spodumene", "#E8B8D8", "#F0C8E8",
         ior=1.66, dispersion_base=0.022, dispersion_amplitude=0.009,
         env=1.35, attenuation_distance=0.6),
    _gem("iolite", "Iolite", "cordierite", "#5A5A9A", "#7A7AB8",
         ior=1.55, dispersion_base=0.02, dispersion_amplitude=0.008,
         env=1.35, attenuation_distance=0.5),
    _gem("sunstone", "Sunstone", "feldspar", "#E8A060", "#F0C080",
         ior=1.54, dispersion_base=0.018, dispersion_amplitude=0.008,
         env=1.3, attenuation_distance=0.55, iridescence=0.4),
    _gem("topaz-imperial", "Imperial Topaz", "topaz", "#E8A040", "#F0C060",
         ior=1.62, dispersion_base=0.018, dispersion_amplitude=0.008,
         env=1.4, attenuation_distance=0.55),
    _gem("emerald-colombian", "Colombian Emerald", "beryl", "#0E9A48", "#4AC878",
         ior=1.58, dispersion_base=0.02, dispersion_amplitude=0.008,
         roughness=0.04, env=1.35, attenuation_distance=0.45),
    _gem("pearl-tahitian", "Tahitian Pearl", "pearl", "#3A4A4A", "#5A6A6A",
         ior=1.53, dispersion_base=0.012, dispersion_amplitude=0.005,
         roughness=0.35, env=1.0, attenuation_distance=0.3,
         transmission=0.0, iridescence=0.8),
    _gem("pearl-golden", "Golden Pearl", "pearl", "#E8C880", "#F0D8A0",
         ior=1.53, dispersion_base=0.012, dispersion_amplitude=0.005,
         roughness=0.32, env=1.05, attenuation_distance=0.35,
         transmission=0.0, iridescence=0.65),
    _cabochon("cabochon-garnet", "Garnet Cabochon", "#7A1F2D", "#A82037"),
    _cabochon("cabochon-citrine", "Citrine Cabochon", "#E4C04A", "#FFE08A"),
    _cabochon("cabochon-morganite", "Morganite Cabochon", "#FFCBC4", "#FFE4DD"),
    _opaque("jade-dark", "Dark Jade", "#2A6A4A"),
    _opaque("agate-fire", "Fire Agate", "#C86040"),
]
