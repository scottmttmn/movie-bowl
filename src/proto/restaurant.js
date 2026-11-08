// PROTOTYPE ONLY (restaurant bowl mockup). Not for merge.
export const CUISINES = ["American", "Pizza", "Mexican", "Chinese", "Italian", "Mediterranean", "Pub", "Cafe", "Thai", "Sushi", "Indian", "BBQ"];
export const isRestaurantBowlName = (name) => /eats/i.test(name || "");
export const bookingHost = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; } catch { return null; }
};
const HOST_NAMES = { opentable: "OpenTable", resy: "Resy", exploretock: "Tock", yelp: "Yelp" };
export const bookingLabel = (url) => HOST_NAMES[bookingHost(url)] || "their site";
