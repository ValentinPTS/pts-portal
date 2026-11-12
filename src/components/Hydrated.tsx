"use client";

import { useEffect } from "react";

// The page's scripts are live: a form handled by them may now be sent (see the guard in app/layout).
export default function Hydrated() {
  useEffect(() => { document.documentElement.setAttribute("data-hydrated", ""); }, []);
  return null;
}
