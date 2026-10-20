// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {PAGE_ROUTES,pageRoute} from "../lib/page-routes.mjs";
import AppFooter from "../components/app-footer";
import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../app/page";
import ChatsAdmin from "../app/admin/social/chats/page";
import NotificationsAdmin from "../app/admin/notifications/page";
import Dependencies from "../app/admin/challenges/dependencies/page";
import Submissions from "../app/admin/challenges/submissions/page";
import Review from "../app/admin/challenges/review/page";
import PacksAdmin from "../app/admin/data/page";
import AppearancesAdmin from "../app/admin/theme/appearances/page";
import MediaLibraryAdmin from "../app/admin/theme/media/page";
import SoundsAdmin from "../app/admin/theme/sounds/page";
import MapsAdmin from "../app/admin/theme/maps/page";
import EntityDialoguePage from "../app/admin/theme/maps/dialogue/page";
import ThemeLibrary from "../app/admin/theme/library/page";
import ChallengeImport from "../app/admin/data/ctfd/page";
import TeamsAdmin from "../app/admin/teams/page";
import TeamsConfiguration from "../app/admin/teams/configuration/page";
import PlayersSettings from "../app/admin/teams/players/page";
import ScoreboardSettings from "../app/admin/teams/scoreboard/page";
import UsersPage from "../app/admin/users/page";
import UserDetailsPage from "../app/admin/users/details/page";
import Scoreboard from "../app/scoreboard/page";
import Admin from "../app/admin/editor";
import "../app/globals.css";
const pages: Record<(typeof PAGE_ROUTES)[keyof typeof PAGE_ROUTES],React.ComponentType> = {
  game:Game, scoreboard:Scoreboard, admin:Admin,
  dependencies:Dependencies, submissions:Submissions, review:Review,
  data:PacksAdmin, ctfd:ChallengeImport, maps:MapsAdmin, dialogue:EntityDialoguePage,
  appearances:AppearancesAdmin, media:MediaLibraryAdmin, sounds:SoundsAdmin, library:ThemeLibrary,
  teams:TeamsAdmin, "team-configuration":TeamsConfiguration, players:PlayersSettings,
  "scoreboard-settings":ScoreboardSettings, users:UsersPage, "user-details":UserDetailsPage,
  notifications:NotificationsAdmin, chats:ChatsAdmin,
};
const route = pageRoute(window.location.pathname);
const Page = route ? pages[route] : null;
createRoot(document.getElementById("root")!).render(
  <>
    {Page ? <Page/> : <main className="admin-studio"><h1>Not found</h1><a href="/">Return to the game</a></main>}
    <AppFooter />
  </>,
);
