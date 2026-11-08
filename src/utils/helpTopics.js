// The help guide. Every answer the ? panel can give is written here, by hand,
// with the one place it sends you. The model never writes an answer: it reads
// the question and picks one of these ids, or none, so the worst it can do is
// point at the wrong real feature -- never describe one the app lacks.
//
// `ask` is what the model reads: the questions a topic answers, in the words
// people use rather than the app's. `to` is a route; `:bowlId` is the bowl on
// screen, else the home bowl. `target` is an element id on that page, ringed
// on arrival. A test holds every route and target to the code, so moving a
// setting fails the suite rather than the help -- change the topic with it.
export const HELP_TOPICS = [
  {
    id: "solo_draw_removal",
    ask: "Watched a bowl movie alone or by myself and want it out of the bowl; stop solo draws leaving movies in my bowls.",
    answer: "Draw it with Solo draw. Turn this on and the pick leaves your bowls.",
    to: "/settings",
    target: "remove-from-bowls-on-solo-draw",
    label: "Solo draw setting",
  },
  {
    id: "solo_draw",
    ask: "Pick a movie just for me, for a night on my own, without using the group's turn or drawing for everyone.",
    answer: "Solo draw picks one of your own movies, from any of your bowls, without spending the bowl's draw.",
    to: "/solo-draw",
    label: "Solo draw",
  },
  {
    id: "remove_own_movie",
    ask: "Delete or remove a movie I added from the bowl; take back a slip I put in.",
    answer: "Open the movie under My Movies and delete it.",
    to: "/bowl/:bowlId",
    target: "my-movies",
    label: "My Movies",
  },
  {
    id: "edit_comment",
    ask: "Change, edit or add the note or comment on a movie I added; say why I added it.",
    answer: "Open the movie under My Movies and edit its comment.",
    to: "/bowl/:bowlId",
    target: "my-movies",
    label: "My Movies",
  },
  {
    id: "favorite",
    ask: "Make one of my movies come up first when I'm picked; favorite, pin, ribbon, prefer a movie.",
    answer: "Open the movie under My Movies and tap the ribbon. When you're picked, your favorite comes up first.",
    to: "/bowl/:bowlId",
    target: "my-movies",
    label: "My Movies",
  },
  {
    id: "return_draw",
    ask: "Undo a draw; put the drawn movie back in the bowl; we didn't end up watching it; redraw.",
    answer: "For two hours after a draw, open it under Watched and move it back to the bowl.",
    to: "/bowl/:bowlId",
    target: "watched",
    label: "Watched",
  },
  {
    id: "remove_watched",
    ask: "Delete or hide a movie from the bowl's watched list or history, after the two hours have passed.",
    answer: "The bowl's owner can open it under Watched and remove it. Everyone keeps their own history.",
    to: "/bowl/:bowlId",
    target: "watched",
    label: "Watched",
  },
  {
    id: "filters",
    ask: "Only draw short movies, a genre, a rating, kid friendly, under two hours; filter what gets drawn tonight.",
    answer: "Filters next to the bowl's name narrow the draw by rating, genre and length.",
    to: "/bowl/:bowlId",
    target: "bowl-filters",
    label: "Filters",
  },
  {
    id: "invite_people",
    ask: "Invite, add or share with a friend, partner or family member so they can join the bowl.",
    answer: "Invite people by email from Invitations. Only the bowl's owner can invite.",
    // Invitations picks the home bowl unless told otherwise; the question was
    // about the bowl on screen.
    to: "/invites?bowl=:bowlId",
    target: "invite-people",
    label: "Invitations",
  },
  {
    id: "accept_invite",
    ask: "Someone invited me to their bowl; join, accept or decline an invitation.",
    answer: "Invitations to other bowls wait in Invitations.",
    to: "/invites",
    label: "Invitations",
  },
  {
    id: "add_link",
    ask: "Let people without an account add movies; share a link for guests to add to the bowl.",
    answer: "An add link lets anyone add movies without an account. The owner makes one in Bowl settings.",
    to: "/bowl/:bowlId/settings",
    target: "add-links",
    label: "Add links",
  },
  {
    id: "members",
    ask: "See or remove members of a bowl; who is in this bowl; kick someone out.",
    answer: "The bowl's members are under People in Bowl settings.",
    to: "/bowl/:bowlId/settings",
    target: "people",
    label: "People",
  },
  {
    id: "leave_bowl",
    ask: "Leave a bowl I was invited to; stop being in a bowl; delete a bowl.",
    answer: "Leave a bowl, or delete one you own, at the bottom of Bowl settings.",
    to: "/bowl/:bowlId/settings",
    label: "Bowl settings",
  },
  {
    id: "draw_method",
    ask: "How the draw picks; make it fair; one person keeps getting picked; take turns; rotation; odds; more movies means more chances.",
    answer: "The bowl's owner chooses how it draws: by person, by title, or taking turns.",
    to: "/bowl/:bowlId/settings",
    target: "drawing",
    label: "Drawing settings",
  },
  {
    id: "draw_access",
    ask: "Stop someone from drawing; choose who is allowed to draw; a kid keeps drawing.",
    answer: "The bowl's owner chooses who can draw in Bowl settings.",
    to: "/bowl/:bowlId/settings",
    target: "drawing",
    label: "Drawing settings",
  },
  {
    id: "starter_pack",
    ask: "The bowl is empty; get movie ideas; add a bunch of movies at once; starter pack.",
    answer: "A starter pack fills the bowl with a set of movies. The owner adds one in Bowl settings.",
    to: "/bowl/:bowlId/settings",
    target: "starter-pack",
    label: "Starter packs",
  },
  {
    id: "create_bowl",
    ask: "Make or create another or a new bowl; separate bowls for different people.",
    answer: "Make a new bowl from My Bowls.",
    to: "/bowls",
    label: "My Bowls",
  },
  {
    id: "switch_bowl",
    ask: "Switch to another bowl; change my home bowl; which bowl opens first.",
    answer: "Tap the bowl's name at the top of its page to switch bowls or make one your home.",
    to: "/bowl/:bowlId",
    label: "Your bowl",
  },
  {
    id: "streaming_services",
    ask: "Tell the app which streaming services I have; Netflix, Hulu, Max; only draw what I can stream; service order.",
    answer: "Add your services and the draw favors what you can stream. Put your favorite first.",
    to: "/settings",
    target: "streaming-services",
    label: "Streaming services",
  },
  {
    id: "rent",
    ask: "Rent or buy a movie that isn't streaming; the drawn movie isn't on any of my services; which store to rent from; turn off rental buttons.",
    answer: "When none of your services carry the drawn movie, it offers a rental from the store you pick here.",
    to: "/settings",
    target: "rent-from",
    label: "Rentals",
  },
  {
    id: "previews",
    ask: "Play trailers or previews before the movie; theater mode; captions on previews; turn previews off.",
    answer: "Theater mode plays previews from the bowl before the drawn movie.",
    to: "/settings",
    target: "playback",
    label: "Previews & playback",
  },
  {
    id: "log_watched",
    ask: "Record a movie I watched outside the app; add something to my watch history by hand.",
    answer: "Log any movie you watched in Watch History.",
    to: "/watch-list",
    label: "Watch History",
  },
  {
    id: "personal_comment",
    ask: "Write what I thought of a movie I watched; rate or review it; private notes on watched movies; delete from my history.",
    answer: "Open any movie in Watch History to add your own private comment, or remove it.",
    to: "/watch-list",
    label: "Watch History",
  },
  {
    id: "tv",
    ask: "Use Movie Bowl on the TV; Google TV; sign in on the television; draw on the big screen.",
    answer: "Open Movie Bowl on the TV, then enter the code it shows here.",
    to: "/activate-tv",
    label: "Connect a TV",
  },
  {
    id: "display_name",
    ask: "Change my name; what others see me as; my display name.",
    answer: "Change the name others see in Settings.",
    to: "/settings",
    target: "display-name",
    label: "Profile",
  },
  {
    id: "delete_account",
    ask: "Delete my account; remove all my data; sign out everywhere.",
    answer: "Delete your account at the bottom of Settings.",
    to: "/settings",
    target: "account",
    label: "Account",
  },
];

const BY_ID = new Map(HELP_TOPICS.map((topic) => [topic.id, topic]));

export function getHelpTopic(id) {
  return BY_ID.get(String(id || "")) || null;
}

// Where a topic goes. A bowl route needs a bowl: the one on screen, else
// home; with neither there is no bowl to open, so My Bowls is the answer. A
// bowl in the query is only a hint, and is dropped when there is none.
export function resolveHelpDestination(topic, bowlId) {
  if (!topic) return null;
  const [path, query] = topic.to.split("?");
  if (bowlId) return topic.to.replaceAll(":bowlId", encodeURIComponent(bowlId));
  return path.includes(":bowlId") ? "/bowls" : path + (query && !query.includes(":bowlId") ? `?${query}` : "");
}

export function helpTopicRoute(topic) {
  return topic.to.split("?")[0];
}

export const HELP_QUESTION_MAX_LENGTH = 200;
