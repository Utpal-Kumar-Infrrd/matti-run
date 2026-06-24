import type { Metadata } from "next";
import HostDashboard from "@/components/HostDashboard";
import "./host.css";

export const metadata: Metadata = {
  title: "Mattie Run — Host Dashboard",
  description: "Host dashboard for Mattie Run multiplayer races.",
};

export default function HostPage() {
  return (
    <main className="host-page">
      <HostDashboard />
    </main>
  );
}
