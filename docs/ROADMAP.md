# Roadmap

| Stage | Goal | Status |
|---|---|---|
| 1 | Projector game | Complete |
| 2 | Head-to-head over Wi-Fi | Complete |
| 3 | 10-round match | Complete |
| 4 | Whole class (up to 24) | Complete |
| 5 | Sound effects and visuals | In progress |
| 6 | Online with lobby codes | In progress |
| 7 | Real-world testing | Not started |

## Stage 1: Projector game
- [x] HTML application that works in my browser
- [x] All functionality works
- [x] Early-2000s Solitaire look (title bar, menus, green felt, suited cards, dialogs, status bar, win cascade)
- [x] GitHub-ready folder structure (`public/`, `docs/`, README, licence, .gitignore)
- [x] Project is on a public GitHub repository

## Stage 2: Head-to-head over Wi-Fi
- [x] I can host the game over a Wi-Fi network and one other person can join and race me
- [x] The game says who finished first

## Stage 3: 10-round match
- [x] Everything from Stage 2 still works
- [x] Play up to 10 rounds in a match
- [x] A scoreboard tallies the results so you can see who is winning

## Stage 4: Whole class
- [x] Up to 24 people can join over the Wi-Fi network
- [x] All Stage 3 functionality still works with 24 players
- [x] The host doesn't play: the host screen displays the scores and moderates the game

## Stage 5: Sound effects and visuals
- [x] Players can select an emoji, shown next to their name, that animates when they win or lose
- [ ] A sound plays when a player selects a card
- [ ] A sound plays during the card cascade
- [ ] A sound plays when time runs out

## Stage 6: Online with lobby codes
- [x] The game is hosted online through a paid hosting service
- [x] Others join through a lobby code
- [ ] I have tested whether multiple games can be hosted at the same time, and whether any issues arise from that
- [ ] I have tested whether the game is blocked on my school's Wi-Fi

## Stage 7: Real-world testing
- [ ] I have tested the game with friends or colleagues
- [ ] I have tested the game with a full class

## Claude usage (energy and water)

Estimated electricity and water used by Claude building this project so far. Updated with every roadmap change; last updated 7 October 2026.

| | Estimate | Plausible range | For scale |
|---|---|---|---|
| **Energy** | **≈ 14.1 kWh** | 5.8–27.4 kWh | about 141 boils of a full electric kettle (58–274 boils) |
| **Water** | **≈ 58 litres** | 6–112 litres | about one short shower |
| **Cost** | **≈ A$4.20** | A$1.66–8.16 | energy ≈ A$3.98 plus water ≈ A$0.23, at Victorian household prices |

Where the energy went (approximate share of the estimate; water follows the same split):

| Activity | Share | Energy |
|---|---|---|
| Reading and writing project files | 29% | ≈ 4.1 kWh |
| Running code and tests | 29% | ≈ 4.1 kWh |
| Claude's built-in instructions (re-read every step) | 22% | ≈ 3.1 kWh |
| Conversation and replies | 12% | ≈ 1.7 kWh |
| Syncing files to the computer | 7% | ≈ 1.0 kWh |

**How this is estimated:** Anthropic doesn't publish energy or water figures for Claude, so these are outside estimates, not measurements. Treat them as an order of magnitude.

- **Energy:** the tokens Claude processed are counted from the session record and converted using climate scientist Zeke Hausfather's estimate for Claude Code (about 170 kWh, range 70–330 kWh, for 3.2 billion tokens).
- **Water:** energy is converted using UC Riverside's research (Li, Yang, Islam and Ren), about 4.1 litres per kWh in total: water evaporated cooling the data centre plus water used by power stations generating the electricity (US average). The range runs from the low energy estimate with cooling water only to the high energy estimate with both.
- **Cost:** energy and water priced at Victorian household rates for 2026–27 in Hoppers Crossing's area: 28.22c per kWh for electricity (Victorian Default Offer, Powercor zone, Essential Services Commission) and $3.8954 per kilolitre for water (Greater Western Water, first-step usage charge). This is what the same electricity and water would cost a Victorian household, not what Anthropic pays.
- **Split between activities:** weighted by cost, so re-reading earlier conversation counts for less than new reading or writing.

## Change log
- **2026-10-07** Card sound effects added to the player screen (public/sounds/): a card flick when selecting a card, a long riffle shuffle during the win cascade, and a short shuffle when time runs out. The sounds are original, made for the game, so there are no licence issues. Sound can be switched off in the Game menu. The criteria stay unticked until you've listened to them.
- **2026-10-07** Host waiting room redesigned: the card and match-length settings sit beside the lobby code, player names and emoji are larger and centred, and the whole waiting room fits on a 1366×768 laptop screen with 24 players. On smaller screens the player list scrolls inside the room, so Start Match always stays visible.
- **2026-10-07** All emoji now gently sway all the time: in the picker grid, on the picker button and next to names on every screen, each slightly out of step with the others. The win bounce and lose droop take over when they happen. Devices set to reduce motion show them still.
- **2026-10-07** Emoji picker is now a small button next to the name box. Tapping it opens a large grid of emoji (grouped into Faces and Animals) in the middle of the screen; picking one closes it. Replaces the dropdown.
- **2026-10-07** Removed the devil emoji, leaving 40: 19 faces and 21 animals.
- **2026-10-07** Emoji list: added 8 more faces (😭 😱 🙄 😤 😠 😈 🤢 🤮) and removed the Food and Other emoji, leaving 41: 20 faces and 21 animals.
- **2026-10-07** Added 12 face emoji (😀 😂 😎 🤓 🥳 🤩 😇 🤔 😜 🤠 🤯 😴), making 42 in total. The emoji dropdown is now grouped into Faces, Animals, Food and Other.
- **2026-10-07** Stage 5 renamed to Sound effects and visuals, with a new criterion for player emoji (already done).
- **2026-10-07** Player emoji: students pick one of 30 classroom-friendly emoji from a dropdown when joining. It shows next to their name on every screen (waiting room, races, scoreboards, opponent panel, podium), bounces when they win their race or the match, and droops and greys out when they lose. The server only accepts emoji from the list.
- **2026-10-07** The roadmap is no longer published to GitHub: both copies are in .gitignore and the README no longer links to it.
- **2026-10-07** Added Stage 5: sound effects (selecting a card, the card cascade, and time running out). Online with lobby codes is now Stage 6 and real-world testing is Stage 7; earlier change-log entries use the old numbers.
- **2026-10-07** Host final results: the Change Settings and New Match buttons now sit in a row at the bottom of the scoreboard, so they no longer cover any scores or the podium.
- **2026-10-07** The lobby now closes when the match starts, so a code shared with another class won't work. Players who drop out (for example, their phone locks) can rejoin by typing the same code and name, and keep their score. The lobby opens again when the host returns to the waiting room.
- **2026-10-07** Removed the explanatory notes under each criterion on the roadmap.
- **2026-10-07** Load test: three lobbies of 24 players each played 10-round matches at the same time on one server (run by Claude on a copy of the server, not on Render). No problems found: no cross-lobby mix-ups, correct groups and scores, the 3-second auto-start worked in every lobby, and the server used about 83 MB of memory and under 5% of one CPU core.
- **2026-10-07** Added a Stage 5 criterion: test whether the game is blocked on the school's Wi-Fi.
- **2026-10-07** Added a Stage 5 criterion: test whether multiple games can be hosted at the same time, and whether any issues arise. Stage 5 is back in progress until this is tested.
- **2026-10-07** Player screen: making 24 plays the card cascade with the scoreboard shown on top straight away (updating live while the others finish). The results window has no buttons: the next round, or the host starting a new match, clears it; returning to the waiting room closes it too.
- **2026-10-07** Claude usage cost now uses Victorian prices: the Victorian Default Offer electricity rate (Powercor zone) and Greater Western Water's usage charge, both for Hoppers Crossing.
- **2026-10-07** Claude usage now includes an estimated cost in Australian dollars for the energy and water, at average Australian household prices.
- **2026-10-07** About window now shows only the credit line: “Created and hosted by JML (2026) for use at Hoppers Crossing Secondary College.” The duplicate About item under the projector game's Help menu was removed.
- **2026-10-07** Claude usage: kettle boils now shown with a plausible range, like energy and water.
- **2026-10-07** Added an About tab to the top bar of every screen (projector game, host and player): “Created and hosted by JML (2026) for use at Hoppers Crossing Secondary College.”
- **2026-10-07** Added Stage 6: real-world testing, first with friends or colleagues, then with a full class.
- **2026-10-07** Stage 5 tested online and working. Stage 5 complete.
- **2026-10-07** The host no longer presses Next Round: after each round's results, a 3-second countdown runs on every screen and the next round starts by itself (after the “Out of time!” screen when time ran out). End Game during the countdown still ends the match.
- **2026-10-07** Stage 5 built: lobby codes. The host screen creates a lobby with a 5-character code shown large for the projector; players go to the site's home page, type the code and their name, and join. One server runs many lobbies at once, kept completely separate, and a refreshed host screen takes back its own lobby. Inside a lobby the game plays exactly as in Stage 4. Added Render hosting settings (`render.yaml`) and instructions. Tested here with two lobbies playing at the same time. Waiting on the paid hosting set-up and a real test.
- **2026-10-07** Water now shown as a single total.
- **2026-10-07** Claude usage section now includes estimated water use (data-centre cooling and power generation) alongside energy.
- **2026-10-07** Claude usage section now reported as energy (kWh) instead of tokens.
- **2026-10-07** Claude usage section now updated with every roadmap change.
- **2026-10-07** Added a Claude usage section with token totals for the project so far.
- **2026-10-07** Stage 4 tested and working. Added criterion: the host doesn't play, but displays the scores and moderates the game. Stage 4 complete.
- **2026-10-07** Out of time: when the 30 seconds run out, unfinished players' cards grey out and sink with a red "Out of time!" message, and the results wait a moment so it's seen. Players who end because the host pressed End Game are told so instead.
- **2026-10-07** Host "Bonk" penalty for suspected cheating: takes 500 points (never below 0), with a shake and a floating "BONK!" on the scoreboard; the bonked player is told, and bonk counts appear on the scoreboard.
- **2026-10-07** Removed the 6-card option: the host chooses 4 or 5 cards. Round time limit stays fixed at 30 seconds.
- **2026-10-07** Host can choose 4, 5 or 6 cards per puzzle (target still 24, every card must be used). Solver extended to 5 and 6 cards with the same rules: numbers 1–9, whole-number steps, always solvable without brackets. The projector game stays at 4 cards.
- **2026-10-07** Player screen: the opponent panel now says "You're racing" above the opponent's name, shown larger and in yellow. In a group of three, both opponents' cards sit in a single row so everything fits on screen.
- **2026-10-07** Host final results view: when a match ends, the host screen shows a larger full-width scoreboard with a podium for the top three (names and scores) underneath.
- **2026-10-07** Host controls: rename players in the waiting room (✎ next to each name), and End Game at any point, which makes the current scoreboard the final result on every screen.
- **2026-10-07** Scoring changed to time-based points for everyone: anyone who makes 24 within 30 seconds scores 1,000 → 500 for their own speed, plus 100 bonus for finishing first in their group. Races continue until everyone in the group has solved or given up.
- **2026-10-06** New host screen (`/host.html`): the teacher no longer plays. It shows the join address, sets the match length, starts each round, and shows the cards, time left, every race and a live scoreboard. The player screen has no host controls.
- **2026-10-06** Player limit raised from 20 to 24 (12 pairs at full capacity).
- **2026-10-06** Stage 4 built: up to 20 players, drawn into pairs each round (plus one group of three for odd numbers), new opponents every round, same cards for every group, 30-second rounds, host starts each round, one shared scoreboard. Tested here with 7, 8 and 20 simulated players. Waiting on a real classroom test.
- **2026-10-06** Stage 3 tested on real devices and working. Stage 3 complete.
- **2026-10-06** Scoreboard redrawn as XP-style progress bars: the top score fills the bar and the others are scaled against it, so bar lengths show the gap. Bars grow and points count up after each round.
- **2026-10-06** Race screen: the opponent's cards now appear face down beside yours and animate as they play (select, combine, undo, reset, give up, win) without showing their numbers. The table area also scrolls on small screens.
- **2026-10-06** Stage 3 built: matches of 1–10 rounds (host chooses), speed-based points (500–1,000 per round win), scoreboard after every round and a final match result. Waiting on a real two-device test.
- **2026-10-06** Stage 2 tested on real devices and working. Stage 2 complete.
- **2026-10-06** Stage 2 built: Node.js race server (`server/index.js`) and race screen (`public/race.html`). Same puzzle for both players, server-checked answers, first to 24 wins. Waiting on a real two-device test.
- **2026-10-06** All functionality confirmed working. Stage 1 complete.
- **2026-10-06** No fractional cards (÷ must divide exactly). Puzzles are only dealt if they can be solved without brackets, and solutions are shown without brackets.
- **2026-10-06** Stage 1 criteria updated: Solitaire look and folder structure added as done; public GitHub repository done.
- **2026-10-06** Restyled as an early-2000s desktop card game: title bar, Game/Help menus, green felt, suited playing cards, dialogs, status bar and a bouncing-card win cascade.
- **2026-10-06** Added a Stage 1 criterion: the project is on a public GitHub repository.
- **2026-10-06** Split the game into `public/` (HTML, CSS, JS) ready for GitHub; solver separated so the server can reuse it.
- **2026-10-06** Fixed: going back after revealing a solution froze the cards. It now resets the puzzle for an unscored practice try.
- **2026-10-06** Removed difficulty settings: puzzles always use 1–9 and are always solvable.
- **2026-10-06** First version of the projector game.
