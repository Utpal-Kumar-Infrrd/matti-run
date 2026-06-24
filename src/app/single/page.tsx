import type { Metadata } from "next";
import Game from "@/components/Game";

export const metadata: Metadata = {
  title: "Mattie Run — Single Player",
  description: "Play Mattie Run solo — maze, collectibles, and puzzle.",
};

export default function SinglePlayerPage() {
  return <Game mode="single" />;
}
