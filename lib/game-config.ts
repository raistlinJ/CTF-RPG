import raw from "../content/game.yaml?raw";
import { parseGame } from "./config-schema.mjs";
export const gameConfig = parseGame(raw);
