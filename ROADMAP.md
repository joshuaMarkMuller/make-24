# Roadmap

| Stage | Goal | Status |
|---|---|---|
| 1 | Projector game | Complete |
| 2 | Head-to-head over Wi-Fi | In progress |
| 3 | 10-round match | Not started |
| 4 | Whole class (up to 20) | Not started |
| 5 | Online with lobby codes | Not started |

## Stage 1: Projector game
- [x] HTML application that works in my browser
- [x] All functionality works
- [x] Early-2000s Solitaire look (title bar, menus, green felt, suited cards, dialogs, status bar, win cascade)
- [x] GitHub-ready folder structure (`public/`, `docs/`, README, licence, .gitignore)
- [x] Project is on a public GitHub repository

## Stage 2: Head-to-head over Wi-Fi
- [ ] I can host the game over a Wi-Fi network and one other person can join and race me
- [ ] The game says who finished first

## Stage 3: 10-round match
- [ ] Everything from Stage 2 still works
- [ ] Play up to 10 rounds in a match
- [ ] A scoreboard tallies the results so you can see who is winning

## Stage 4: Whole class
- [ ] Up to 20 people can join over the Wi-Fi network
- [ ] All Stage 3 functionality still works with 20 players

## Stage 5: Online with lobby codes
- [ ] The game is hosted online through a paid hosting service
- [ ] Others join through a lobby code

## Change log
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
