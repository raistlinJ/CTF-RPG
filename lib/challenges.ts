import raw from "../content/challenges.yaml?raw";
import { parseChallenges } from "./config-schema.mjs";
export const challenges = parseChallenges(raw,null);
