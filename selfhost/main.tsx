import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../app/page";
import UsersPage from "../app/admin/users/page";
import Scoreboard from "../app/scoreboard/page";
import Admin from "../app/admin/editor";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(
  window.location.pathname.startsWith("/admin/users") ? (
    <UsersPage />
  ) : window.location.pathname.startsWith("/admin") ? (
    <Admin />
  ) : window.location.pathname.startsWith("/scoreboard") ? (
    <Scoreboard />
  ) : (
    <Game />
  ),
);
