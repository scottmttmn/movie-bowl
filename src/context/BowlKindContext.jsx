import { createContext, useContext } from "react";
import { BOWL_KINDS } from "../utils/restaurants";

// Which kind of bowl the cards on screen belong to. A context rather than a
// prop because the strips, cards and stat line sit several layers under the
// bowl page, and everything outside a bowl page is a movie surface.
const BowlKindContext = createContext(BOWL_KINDS.movies);

export const BowlKindProvider = BowlKindContext.Provider;

export function useBowlKind() {
  return useContext(BowlKindContext);
}
