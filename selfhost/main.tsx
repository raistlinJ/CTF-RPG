// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import AppFooter from "../components/app-footer";
import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../app/page";
import NotificationsAdmin from "../app/admin/notifications/page";
import Dependencies from "../app/admin/challenges/dependencies/page";
import Submissions from "../app/admin/challenges/submissions/page";
import Review from "../app/admin/challenges/review/page";
import PacksAdmin from "../app/admin/data/page";
import ImageLibraryAdmin from "../app/admin/theme/images/page";
import MediaAdmin from "../app/admin/theme/media/page";
import MapsAdmin from "../app/admin/theme/maps/page";
import EntityDialoguePage from "../app/admin/theme/maps/dialogue/page";
import ThemeLibrary from "../app/admin/theme/library/page";
import ChallengeImport from "../app/admin/data/ctfd/page";
import TeamsAdmin from "../app/admin/teams/page";
import TeamsConfiguration from "../app/admin/teams/configuration/page";
import PlayersSettings from "../app/admin/teams/players/page";
import ScoreboardSettings from "../app/admin/teams/scoreboard/page";
import UsersPage from "../app/admin/users/page";
import Scoreboard from "../app/scoreboard/page";
import Admin from "../app/admin/editor";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(
  <>
    {window.location.pathname.startsWith("/admin/notifications") ? (
      <NotificationsAdmin/>
    ) : window.location.pathname.startsWith("/admin/challenges/dependencies") ? (
      <Dependencies />
    ) : window.location.pathname.startsWith("/admin/challenges/submissions") ? (
      <Submissions />
    ) : window.location.pathname.startsWith("/admin/data/ctfd") ? (
      <ChallengeImport />
    ) : window.location.pathname.startsWith("/admin/challenges/review") ? (
      <Review />
    ) : window.location.pathname.startsWith("/admin/theme/images") ? (
      <ImageLibraryAdmin />
    ) : window.location.pathname.startsWith("/admin/theme/media") ? (
      <MediaAdmin />
    ) : window.location.pathname.startsWith("/admin/theme/library") ? (
      <ThemeLibrary />
    ) : window.location.pathname.startsWith("/admin/theme/maps/dialogue") ? (
      <EntityDialoguePage />
    ) : window.location.pathname === "/admin/theme" || window.location.pathname === "/admin/theme/" || window.location.pathname.startsWith("/admin/theme/maps") ? (
      <MapsAdmin />
    ) : window.location.pathname === "/admin/data" || window.location.pathname === "/admin/data/" ? (
      <PacksAdmin />
    ) : window.location.pathname.startsWith("/admin/teams/configuration") ? (
      <TeamsConfiguration />
    ) : window.location.pathname.startsWith("/admin/teams/players") ? (
      <PlayersSettings />
    ) : window.location.pathname.startsWith("/admin/teams/scoreboard") ? (
      <ScoreboardSettings />
    ) : window.location.pathname.startsWith("/admin/teams") ? (
      <TeamsAdmin />
    ) : window.location.pathname.startsWith("/admin/users") ? (
      <UsersPage />
    ) : window.location.pathname.startsWith("/admin") ? (
      <Admin />
    ) : window.location.pathname.startsWith("/scoreboard") ? (
      <Scoreboard />
    ) : (
      <Game />
    )}
    <AppFooter />
  </>,
);
