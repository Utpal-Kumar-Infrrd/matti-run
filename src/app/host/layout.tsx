import type { Metadata } from "next";
import HostScrollUnlock from "@/components/HostScrollUnlock";
import "./host.css";

export const metadata: Metadata = {
  title: "Mattie Run — Host Dashboard",
  description: "Host dashboard for Mattie Run multiplayer races.",
};

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HostScrollUnlock />
      {children}
    </>
  );
}
