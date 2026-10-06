import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../app/page";
import Admin from "../app/admin/editor";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(
  window.location.pathname.startsWith("/admin") ? <Admin /> : <Game />,
);
