repo: scottmttmn/movie-bowl
branch: main

## Last sync
date: 2026-09-16T13:48:02Z

### Updated in this project
- Redesigned the Solo Draw page against the shipped bowl-dashboard hero pattern.
- Added a violet solo accent + single-avatar hero to distinguish solo from group draws.
- Reused the real bowl illustration asset, nav/filter icon SVGs, and hold-to-draw gesture timing.
- Added a TV solo draw screen (draw / drawing / reveal) built on the tv.css 10-foot vocabulary.

## Screen map
| Project screen | Repo files |
| --- | --- |
| Solo Draw.dc.html | src/screens/SoloDrawPage.jsx, src/components/HoldToDrawButton.jsx, src/components/BowlIllustration.jsx, src/components/MyMoviesStrip.jsx, src/hooks/useSoloDrawPool.js, src/components/TopNav.jsx, src/screens/BowlDashboard.jsx (header icons), src/index.css, output/designs/bowl-dashboard-hero.md |
| Solo Draw TV.dc.html | src/tv/tv.css, src/tv/screens/TvBowlPicker.jsx, src/tv/components/TvBrand.jsx, src/tv/components/TvTheaterTicket.jsx, src/tv/components/TvStreamingRail.jsx, src/tv/TvApp.jsx |
