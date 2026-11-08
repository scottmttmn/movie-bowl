// The help guide. The model never writes an answer: it only picks one of these
// ids (or none), so it cannot describe a feature the app does not have. Each
// answer is one line and one place to go.
export const HELP_TOPICS = [
  {
    id: "solo_draw_removal",
    answer: "Draw it with Solo draw. Turn this on and the pick leaves your bowls.",
    to: "/settings#solo-draw",
    target: "remove-from-bowls-on-solo-draw",
    label: "Solo draw setting",
  },
  {
    id: "remove_own_movie",
    answer: "Open the movie under My Movies and remove it.",
    to: "/bowl/:bowlId#my-movies",
    label: "My Movies",
  },
  {
    id: "invite_people",
    answer: "Invitations sends a link by email.",
    to: "/invites#invite-people",
    label: "Invitations",
  },
  {
    id: "draw_method",
    answer: "The bowl's owner picks how it draws, in Bowl settings.",
    to: "/bowl/:bowlId/settings#drawing",
    label: "Drawing settings",
  },
  {
    id: "streaming_services",
    answer: "Add your services and the draw favors what you can stream.",
    to: "/settings#streaming-services",
    label: "Streaming services",
  },
  {
    id: "undo_draw",
    answer: "For two hours, the drawn movie can go back in the bowl from Watched.",
    to: "/bowl/:bowlId#watched",
    label: "Watched",
  },
];

// Mockup stand-in for the model call.
export function mockPickHelpTopic(question) {
  const q = question.toLowerCase();
  if (/alone|myself|by myself|solo|on my own/.test(q)) return "solo_draw_removal";
  if (/invite|share|add (a )?friend/.test(q)) return "invite_people";
  if (/stream|netflix|service/.test(q)) return "streaming_services";
  return null;
}
