"use client";

import { useEffect } from "react";

/** Re-enable page scroll on /host (game.css locks body overflow on play routes). */
export default function HostScrollUnlock() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.classList.add("host-route");
    body.classList.add("host-route");

    return () => {
      html.classList.remove("host-route");
      body.classList.remove("host-route");
    };
  }, []);

  return null;
}
