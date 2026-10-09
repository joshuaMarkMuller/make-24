# Roadmap

| Stage | Goal | Status |
|---|---|---|
| 1 | Projector game | Complete |
| 2 | Head-to-head over Wi-Fi | Complete |
| 3 | 10-round match | Complete |
| 4 | Whole class (up to 24) | Complete |
| 5 | Sound effects and visuals | Complete |
| 6 | Online with lobby codes | In progress |
| 7 | Suggested improvements | Complete |
| 8 | Real-world testing | Not started |

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
- [x] Card select: a short card flick plays when a player selects a card
- [x] Win cascade: a long riffle shuffle plays during the card cascade
- [x] Out of time: a short shuffle plays when time runs out

## Stage 6: Online with lobby codes
- [x] The game is hosted online through a paid hosting service
- [x] Others join through a lobby code
- [ ] I have tested whether multiple games can be hosted at the same time, and whether any issues arise from that
- [ ] I have tested whether the game is blocked on my school's Wi-Fi

## Stage 7: Suggested improvements
- [x] A player whose connection drops rejoins automatically, keeping their seat, score and lives
- [x] Bonk needs a second press to confirm, so a slip can't penalise anyone
- [x] The host can pause after the current round and resume when ready
- [x] The player help screen is up to date (lobby code, emoji, both game modes and giving up)
- [x] The home page has a "Host a game" link
- [x] Ranks are hidden until someone scores, so nobody shows as "1=" at the start
- [x] Card taps send small updates, at most 10 a second, instead of the whole game
- [x] Screens only redraw the parts that changed
- [x] Speed points are timed on the player's device, so a slow connection doesn't cost points
- [x] Elimination: the group of three rotates so the same players aren't stuck in it
- [x] Knocked-out players can keep solving the same puzzles for fun
- [x] The game has been tested with every change implemented

## Stage 8: Real-world testing
- [ ] I have tested the game with friends or colleagues
- [ ] I have tested the game with a full class
- [ ] Students can join on the devices they'll actually use (school laptops or Chromebooks, iPhones, Android phones and iPads), and the join screen and cards fit on each
- [ ] The host screen is readable from the back of the room on the projector, including the lobby code, scoreboard and hearts
- [ ] A full class can join within 2 minutes using only the code on the projector
- [ ] A full match runs on the school Wi-Fi with no lag between tapping a card and the opponent's face-down cards moving
- [ ] A student whose phone locks or loses Wi-Fi can rejoin with the same name and carries on with their score or lives
- [ ] The host screen survives a refresh mid-match and takes back the same lobby
- [ ] Two classes can play at the same time on the live site without problems
- [ ] A full Points match and a full Elimination match both run from start to podium without needing a refresh
- [ ] Sounds play on student devices, and the Sound off setting works
- [ ] Students understand how to play without the teacher explaining it more than once
- [ ] The 30-second time limit feels fair for most of the class, with most pairs finishing in time
- [ ] Renaming, Bonk and End Game all work during a real lesson
- [ ] The lobby closing stops another class from joining with a shared code
- [ ] Students can't find a way to cheat (for example, two devices under one name, or refreshing to dodge a lost life)
- [ ] Quick feedback is collected from students (fun, too hard or too easy, anything confusing) and any bugs are noted to fix

## Claude usage (energy and water)

Estimated electricity and water used by Claude building this project so far. Updated with every roadmap change; last updated 7 October 2026.

| | Estimate | Plausible range | For scale |
|---|---|---|---|
| **Prompts** | **129** | | messages you've sent Claude so far |
| **Energy** | **≈ 25.6 kWh** | 10.5–49.6 kWh | about 256 boils of a full electric kettle (105–496 boils) |
| **Water** | **≈ 105 litres** | 11–203 litres | about one short shower |
| **Cost** | **≈ A$7.62** | A$3.01–14.79 | energy ≈ A$7.21 plus water ≈ A$0.41, at Victorian household prices |
| **Cost per prompt** | **≈ 5.9c** | 2.3–11.5c | average: total cost ÷ number of prompts |

Where the energy went (approximate share of the estimate; water follows the same split):

| Activity | Share |
|---|---|
| Reading and writing project files | 26% |
| Running code and tests | 35% |
| Claude's built-in instructions (re-read every step) | 20% |
| Conversation and replies | 12% |
| Syncing files to the computer | 6% |

**How this is estimated:** Anthropic doesn't publish energy or water figures for Claude, so these are outside estimates, not measurements. Treat them as an order of magnitude.

- **Energy:** the tokens Claude processed are counted from the session record and converted using climate scientist Zeke Hausfather's estimate for Claude Code (about 170 kWh, range 70–330 kWh, for 3.2 billion tokens).
- **Water:** energy is converted using UC Riverside's research (Li, Yang, Islam and Ren), about 4.1 litres per kWh in total: water evaporated cooling the data centre plus water used by power stations generating the electricity (US average). The range runs from the low energy estimate with cooling water only to the high energy estimate with both.
- **Cost:** energy and water priced at Victorian household rates for 2026–27 in Hoppers Crossing's area: 28.22c per kWh for electricity (Victorian Default Offer, Powercor zone, Essential Services Commission) and $3.8954 per kilolitre for water (Greater Western Water, first-step usage charge). This is what the same electricity and water would cost a Victorian household, not what Anthropic pays.
- **Split between activities:** weighted by cost, so re-reading earlier conversation counts for less than new reading or writing.

**References**

Essential Services Commission. (2026). *Victorian Default Offer*. https://www.esc.vic.gov.au/electricity-and-gas/prices-tariffs-and-benchmarks/victorian-default-offer

Greater Western Water. (2026). *Residential prices and charges*. https://www.gww.com.au/accounts-billing/prices-charges/residential-prices-charges

Hausfather, Z. (2026, August 12). The real energy use of agentic AI. *The Climate Brink*. https://www.theclimatebrink.com/p/the-real-energy-use-of-agentic-ai

Li, P., Yang, J., Islam, M. A., & Ren, S. (2023). *Making AI less "thirsty": Uncovering and addressing the secret water footprint of AI models* (arXiv:2304.03271). arXiv. https://doi.org/10.48550/arXiv.2304.03271

## Change log
- **2026-10-09** Player screen fits without scrolling: the cards shrink to fit the screen's height so the cards, operation buttons, Undo/Reset/Give Up and the race window are all visible on school laptops (1366×768 and 1280×720 with the browser's bars) and phones. Card numbers now scale with the card; phones show the cards in one row; short screens show a 2-line race window and the opponent's face-down cards in one row.
- **2026-10-09** Claude usage: the breakdown by activity (project files, running code and tests, and so on) now shows each as a percentage of the total instead of kWh.
- **2026-10-09** Each pair (and the group of three) now gets its own puzzle every round, so students can't copy a neighbour's answer; no two groups share a puzzle. The projector no longer shows cards. Each student's results show an answer to their own cards. Class test re-run with a new check for this: 69 checks passed, none failed.
- **2026-10-08** Player screen: the messages above the cards are now short statements ("Go!", "You made 24!", "Amira made 24 first. Keep going!", "That’s 22, not 24"). Points and answers still show in the results window.
- **2026-10-08** The 3-2-1 countdown before each round now takes 3.75 seconds. The host screen counts 3, 2, 1 in its clock with a beep on each number and a higher beep as the round starts (Sound on/off in the host's Game menu). When players change places on the host scoreboard, the rows slide into their new order with card flick sounds.
- **2026-10-08** Roadmap page: the change log now shows the latest three entries, with a button to show all of them (or fewer again).
- **2026-10-08** Class test extended for steals and the terminal window (two more small classes, E and F) and re-run: 67 checks passed, none failed.
- **2026-10-08** Fixed: several tabs in one browser are separate players again (the rejoin token is now per tab), so the game can be tried out in one browser. Reloading or a dropped connection still rejoins automatically.
- **2026-10-08** New: a small early-2000s terminal window on every player's screen and on the projector lists who beat whom as each race finishes ("Amira beats Ben and Chloe" for a group of three) and every steal.
- **2026-10-08** New: win your race three rounds in a row to steal. The winner picks a player to take 300 points from (Elimination: a life from someone with two or more lives, which they gain up to their starting lives). The next round waits up to 10 seconds while they choose; everyone sees who stole from whom. Three more wins in a row are needed to steal again.
- **2026-10-08** Join screen: "Host a Game" is now a button in the same style as Join (the "Teacher?" text is gone).
- **2026-10-07** Stage 7 complete. Suggested improvements 13–17 built and all of Stage 7 passed the class test together (2 classes × 24 players × 10 rounds, plus an odd-numbered class and an Elimination class): 55 checks passed, none failed.
- **2026-10-07** Built: card taps now send a small update (at most 10 a second per player) only to that player's opponents and the host, instead of the whole game to the whole class. The host's scoreboard, races and waiting-room list, and the players' waiting-room list, only redraw when something on them changes. Speed points are timed on the player's device (the server accepts it if it's up to 3 seconds less than its own time, otherwise uses its own). The group of three is shared around so the same players aren't stuck in it. In Elimination, players who are out keep getting the same cards to practise on, and it doesn't count.
- **2026-10-07** Class test extended: floods card taps, checks wasted updates and redraws, times a delayed answer and an impossible one, and adds an odd-numbered class (group of three shared around: each player 4 or 5 times in 10 rounds) and an Elimination class (practice when out). Choosing a waiting-room setting that's already selected no longer re-sends the whole game.
- **2026-10-07** Stage 7: auto-rejoin, two-press Bonk, Pause/Resume, the new player help, the Host a game link and hidden ranks all passed the class test (2 classes × 24 players × 10 rounds) and are ticked off. 6 of 12 criteria done.
- **2026-10-07** Fixed (found by the class test): pressing Escape didn't close Help when it was open on top of the round results, which left that player's keyboard stuck for the rest of the match.
- **2026-10-07** Class test added (`npm run test:class`, in `tests/`): plays two classes of 24 at the same time for 10 rounds and checks every round's groups, points and scores, plus dropped connections, page reloads, a second tab, outsiders trying to join, Pause/Resume, two-press Bonk, the player help, the Host a game link and hidden ranks. It ends with a pass/fail report. First full run: 43 checks passed, none failed; the server used about 1% CPU and 85 MB.
- **2026-10-07** Built: the host can pause after the current round (Pause After This Round, or Pause on the results) and press Resume or Start Next Round; players and the projector show that it's paused. The player help screen is rewritten (joining with the code and emoji, each round, both game modes, giving up, keyboard). The home page has a "Host a game" link. Ranks are hidden while everyone is level, so nobody shows as "1=" at the start. All ready to test.
- **2026-10-07** Claude usage updated (129 prompts). Prompts 102–104 were condensed out of the conversation record, so they're counted at the average cost per prompt.
- **2026-10-07** Built: a player whose connection drops (or who reloads the page) now rejoins automatically and keeps their seat, score and lives, using a private token saved on their device. A second tab on the same device takes over the seat. Bonk on the host screen now needs a second press ("Sure?") within 3 seconds. Both ready to test.
- **2026-10-07** Added Stage 7: Suggested improvements, with 11 changes from the design review and a final criterion that the game has been tested with every change implemented. Real-world testing is now Stage 8.
- **2026-10-07** Roadmap page: on the cost of each prompt chart, the dashed average line now runs across the whole chart and shows the average of every prompt so far (the same figure as the cost per prompt).
- **2026-10-07** Stage 7 (Real-world testing): 15 more criteria added covering devices and setup, network and reliability, gameplay, classroom management and student feedback.
- **2026-10-07** Elimination: the breaking-heart animation is replaced by the player's hearts shown in the middle of the screen, with the life they just lost turning white. The animation no longer includes any text.
- **2026-10-07** Elimination: as soon as someone in a pair or group makes 24, the race stops for everyone else in it and a heart breaks in the middle of their screen ("You lose a life!" or "You're out!" with the hearts they have left). The results wait for the animation to finish. Elimination scoreboards on the host and player screens now show just hearts, without progress bars.
- **2026-10-07** Elimination mode: the host can now choose 3, 4 or 5 lives (a Lives setting that appears when Elimination is selected).
- **2026-10-07** Roadmap page: the Claude usage section now has a line chart of the cost of each prompt (prompt number along the bottom, cost in cents up the side). The first 51 prompts only have a recorded total, so they show as their average.
- **2026-10-07** New Elimination game mode, chosen by the host in the waiting room. Everyone starts with 3 lives and is still paired each round (one group of three for odd numbers). The first in each group to make 24 keeps their lives and everyone else in the group loses one; if nobody in a group makes 24, they all lose one. Players on 0 lives are out and watch. Last player standing wins. Scoreboards and the podium show hearts, Bonk takes a life, and if a round would knock out every remaining player at once they all stay in on one life. Tested with a simulated 5-player game.
- **2026-10-07** Claude usage: APA 7 references added for the energy, water and price figures (Hausfather, 2026; Li et al., 2023; Essential Services Commission, 2026; Greater Western Water, 2026). On the roadmap page, the dot point about Anthropic not publishing figures was removed.
- **2026-10-07** Roadmap page: the explanation above the Claude usage figures is now a short list of dot points.
- **2026-10-07** Claude usage now shows the average cost per prompt (total cost ÷ number of prompts), after the cost in A$.
- **2026-10-07** Stage 5 complete. Sound effects added: a card flick when selecting a card, a long riffle shuffle during the win cascade, and a short shuffle when time runs out. No more sound effects planned.
- **2026-10-07** Claude usage now starts with the total number of prompts sent. The first 51 were counted from the conversation summary, since the earliest messages are no longer in the session record.
- **2026-10-07** The win cascade now plays behind everything else on the table (cards, buttons, messages, the opponent panel and the scoreboard) on both the player screen and the projector game. In the projector game, clicking anywhere on the table still skips it.
- **2026-10-07** Player screen: when a player gets down to one card that isn't 24, the card shakes with a red glow and shrinks away, then the cards deal back in automatically (under a second) so they can try again. No points are lost and opponents see the reset on the face-down cards.
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
