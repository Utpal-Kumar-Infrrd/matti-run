import type { Metadata } from "next";
import HostDashboard from "@/components/HostDashboard";
import "./host.css";

export const metadata: Metadata = {
  title: "Matti Run — Host Dashboard",
  description: "Host dashboard for Matti Run multiplayer races.",
};

export default function HostPage() {
  return (
    <main className="host-page">
      <HostDashboard />
    </main>
  );
}
