/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TWITCH_CLIENT_ID: string;
  readonly VITE_TWITCH_OAUTH_TOKEN: string;
  // add more env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
