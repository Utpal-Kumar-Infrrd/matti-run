export {};

declare global {
  interface Window {
    __MATTI_RUN_MULTIPLAYER_URL__?: string;
    __MATTIE_RUN_GAME_MODE__?: "multiplayer" | "single";
  }
}
