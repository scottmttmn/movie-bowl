# Movie Ratings

Status: built November 14, 2026 (v1). The stats and nudges under **Later**
are not built.

## The idea

A bowl's history used to end at the draw: what came out, and when. Ratings
give it a second half -- what everyone thought -- so that over time the bowl
can show whose taste matches yours and whose picks the group enjoys.

## Decisions

- **One rating per person per movie**, on four thumbs: two down, one down,
  one up, two up. Changeable, and clearable by tapping the pick again.
  Unrated is no row at all, never a zero, so leaving a movie unrated never
  reads as a verdict.
- **It rates the movie, not the pick.** Not every watched movie came from a
  bowl, and one kind of rating everywhere is simpler. "How well does Robin
  pick for us" is answered later by summarising ratings of Robin's drawn
  slips, not by asking a second question.
- **Two places to rate, one rating.** Watch History (every entry, bowl or
  not) and a bowl's watched movies edit the same value. A rewatch shows the
  same thumbs. A custom title has no shared id, so its rating hangs on the
  history entry it was given on.
- **The rating lives as long as the history.** Deleting your last entry of a
  movie deletes your rating of it, which also covers a draw returned to the
  bowl inside its undo window.
- **Rate to reveal, in a bowl.** Before you rate a bowl's watched movie, the
  members who have rated it sit face down as dashed initials under the
  thumbs: you learn who, not what. Your tap turns them over into a column
  under the thumb each chose, yours ringed. The database enforces this --
  `get_bowl_watched_ratings` returns the others' thumbs only once you have
  rated -- so the reveal cannot be read early. Members who left the bowl drop
  out of its thumbs; ratings people gave elsewhere count, because it is one
  rating per movie.
- **The shared history link** shows the owner's thumb on each poster only
  while "Show my comments" is on: one switch for "show what I thought".
- **No new questions.** No "first time?" prompt, no popularity guess, no
  draw-time snapshot. Whether someone had seen a movie before the draw can be
  read later from their history entries dated before it.
- **Show, don't tell.** No labels beside the thumbs. Ups are gold, downs
  rose. Screen readers hear Strong dislike, Dislike, Like, Love.

## Where the thumbs are

| Surface | What it shows |
| --- | --- |
| Watch History card | Four quiet thumbs under the date; one tap rates. Dim until used, so unrated cards are the catch-up list. |
| Watch History movie sheet | The same four, under the poster. |
| Log / Edit watched sheet | The four under the date, saved with the entry. |
| Bowl Watched strip | Your thumb on the poster's corner, once rated. Nobody else's. |
| Bowl movie sheet | Your thumbs, then the bowl's: face down until you rate, then in columns. |
| Shared link `/w/:token` | The owner's thumb on the poster corner, with comments on. |

Restaurant bowls, solo draw's reveal and the television get nothing: a
restaurant draw writes no personal history, and rating with a remote is its
own design.

## Data

`user_movie_ratings` -- `user_id`, `rating` (-2, -1, 1, 2), and either
`tmdb_id` (unique per person) or `watch_event_id` (custom titles). Each person
reads their own rows; writes go through `set_my_movie_rating(entry, rating)`,
which takes one of your own history entries and works out the key. A trigger
on `user_watch_events` deletes a TMDB rating once its last entry is gone.
`get_bowl_watched_ratings(bowl)` returns one row per active draw and current
member who has rated it, with the member's display name and `is_self`.

## Later

Each of these reads data v1 already keeps; none is built.

- **Whose picks land**, per bowl: ratings of each member's drawn slips, the
  submitter's own thumb excluded, sample size always shown, worded as
  appreciation ("your picks earned 18 two-ups"), never a leaderboard.
- **Taste match** between two members ("you and Robin agreed on 8 of 10").
- **A bowl verdict** once everyone in the draw has rated it, without naming
  anyone who has not.
- **A dismissible "How was it?" card** on the bowl after a draw, if people do
  not rate unprompted.

Never: streaks, badges, overdue nudges or push notifications. Rating should
feel like sharing an opinion, not homework.
