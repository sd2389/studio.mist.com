import type { Metadata } from "next";
import { HomeFilm } from "@/components/home/HomeFilm";

export const metadata: Metadata = {
  title: "MIST Studio · Your own jewelry, photographed in the browser",
  description:
    "Upload your CAD and get studio stills with ray-traced diamonds, 360° video, a one-click Campaign Pack and a shoppable 3D embed. No render software. Free to start.",
};

export default function Home() {
  return <HomeFilm />;
}
