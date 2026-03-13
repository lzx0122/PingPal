import pubgCover from "@/assets/pubg_cover.png";

export interface Server {
  id: string;
  name: string;
  flag: string;
  region: string;
  endpoint: string;
  publicKey: string;
  location: [number, number]; // [latitude, longitude]
}

export interface Game {
  id: string;
  name: string;
  image: string;
  processName: string; // TslGame.exe
  servers: Server[];
}

export const GAMES: Game[] = [
  {
    id: "pubg",
    name: "PUBG: BATTLEGROUNDS",
    image: pubgCover,
    processName: "TslGame.exe",
    servers: [
      {
        id: "tw-gcp-1",
        name: "Taiwan GCP Node 1",
        flag: "",
        region: "Taiwan (Changhua)",
        endpoint: "34.80.46.250:51820",
        publicKey: "J8j5OOO9qtR8eI+GSw+TBttF3scLv1aiUeoLoMu8B2w=",
        location: [24.0518, 120.5161], // Changhua, Taiwan coordinates
      },
    ],
  },
];
