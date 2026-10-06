# Roadmap

| Stage | Goal | Status |
|---|---|---|
| 1 | Projector game | Complete |
| 2 | Head-to-head over Wi-Fi | Complete |
| 3 | 10-round match | Complete |
| 4 | Whole class (up to 24) | Complete |
| 5 | Online with lobby codes | Not started |

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
- [x] The host doesn't play: the host screen displays the scores and moderates the game (match settings, renaming players, Bonk, End Game)

## Stage 5: Online with lobby codes
- [ ] The game is hosted online through a paid hosting service
- [ ] Others join through a lobby code

## Change log
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
