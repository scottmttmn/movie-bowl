import { useSearchParams } from "react-router-dom";
import HomeRedirect from "./HomeRedirect";
import { getSharedMovieQuery } from "../utils/sharedMovieQuery";

// The entry point for adding from outside the app: the home-screen shortcut
// opens it bare, and Android's share sheet opens it with title/text/url (see
// share_target in public/manifest.webmanifest). Either way it resolves the home
// bowl like "/" does, and the add sheet opens there already searching.
export default function QuickAddRedirect() {
  const [params] = useSearchParams();
  const query = getSharedMovieQuery({
    q: params.get("q") || "",
    title: params.get("title") || "",
    text: params.get("text") || "",
    url: params.get("url") || "",
  });
  return <HomeRedirect state={{ quickAdd: { query } }} />;
}
