import { Pixelify_Sans, Press_Start_2P } from "next/font/google";

/** Chunky 8×8 pixel face for titles, buttons and HP boxes. */
export const pressStart = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-press" });
/** Readable pixel face for body text, questions and explanations. */
export const pixelify = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixelify" });
