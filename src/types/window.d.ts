import type { MatchaLunaFacade } from '../compatibility/facade';

declare global {
  interface Window {
    MatchaLunaApp: MatchaLunaFacade;
  }
}

export {};
