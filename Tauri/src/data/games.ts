import pubgCover from "@/assets/pubg_cover.png";

export interface Server {
  id: string;
  name: string;
  flag: string;
  region: string;
  endpoint: string;
  publicKey: string;
  location: [number, number]; // [longitude, latitude] (matches DB / vps-agent)
  tags?: string[]; // supported game tags
}

export interface Game {
  id: string;
  name: string;
  image: string;
  processName: string;
  tag: string;
}

export const GAMES: Game[] = [
  {
    id: "pubg",
    name: "PUBG: BATTLEGROUNDS",
    image: pubgCover,
    processName: "TslGame.exe",
    tag: "pubg",
  },
];
