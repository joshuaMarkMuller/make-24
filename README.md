# Make 24

A classroom maths game. Students get four numbers from 1 to 9 and combine them with +, −, × and ÷ to make exactly 24.

The project grows in stages, from a single game projected on the board (Stage 1) to an online race for a whole class, with lobby codes (Stage 5). See [docs/ROADMAP.md](docs/ROADMAP.md).

## How to play

1. Click a card, then an operation, then another card. The two cards combine into one.
2. Keep combining until one card is left. If it's 24, you've solved it.

Cards are always whole numbers, so ÷ only works when it divides exactly. Every puzzle has at least one solution that can be written in one line without brackets, using the normal order of operations, for example 8 3 2 2 → 3 × 8 + 2 − 2.

Keyboard: `1`–`4` pick a card · `+ - * /` pick an operation · `Backspace` undo · `R` reset

## Projector game (Stage 1)

Open `public/index.html` in any modern browser. It doesn't need a server or an internet connection. Extra keys: `N` or `F2` new puzzle · `S` reveal solution · `F1` help.

## Class race (Stages 2–4)

Up to 24 players join from their own devices. Each round everyone is drawn into pairs, with one group of three when the number of players is odd (6 players → 3 pairs, 7 → 2 pairs and a three, 19 → 8 pairs and a three). Opponents change every round, avoiding repeat pairings where possible.

Every group gets the same cards at the same moment: 4 or 5 of them (the host chooses), and every card must be used to make 24. Everyone who makes 24 within the time limit scores, and the first in each group wins the race; the server checks every answer, so a score can't be faked. A round lasts at most 30 seconds; anyone still working when time runs out sees their cards grey out under a big “Out of time!” before the results appear. Your opponents' cards are shown face down beside yours and animate as they play, without revealing their numbers.

The teacher runs the game from the **host screen** (`/host.html`), which doesn't play: it shows the join address, lets you choose the number of cards (4 or 5) and the match length (1 to 10 rounds), and has the **Start Match** and **Next Round** buttons. During a round it shows the cards, the time left, every race and a live scoreboard.

Host controls:

- **Rename players**: in the waiting room, click ✎ next to a name to change it (for example if a name is inappropriate). The player sees their new name.
- **Bonk**: if you suspect a player is cheating, press **Bonk** next to their name on the host scoreboard to take 500 points from them (never below 0). Their name and score bar shake with a “BONK!” that floats away, on the host screen and on everyone's results, and the player is told they were bonked. Each player's bonk count is shown on the scoreboard.
- **End Game**: stops the match at any point, after a confirmation. Races still going stop, points already scored count, and the scoreboard at that moment becomes the final result on every screen.

When a match ends (after the last round or with End Game), the host screen switches to a results view: a large scoreboard with a podium for the top three underneath.

**Scoring:** making 24 scores 1,000 points for an instant answer, dropping steadily to 500 at 30 seconds (about 17 points per second), plus a 100-point bonus for finishing first in your group. Players who don't make 24 in time, or give up, score nothing that round. Everyone's points go into one shared scoreboard of progress bars, shown after every round; the final one names the match winner. Players who join mid-round sit out until the next one.

You need [Node.js](https://nodejs.org) (the LTS version) installed.

```
npm install     # first time only
npm start
```

The server prints addresses like these:

```
Host screen (open on your computer):  http://localhost:3000/host.html
Players join at (same Wi-Fi):         http://192.168.1.20:3000/race.html
```

Open the host screen on your computer (put it on the projector), and give players the Wi-Fi address it shows (or open several browser windows to try it alone). Everyone types a name; you press **Start Match** on the host screen. Press `Ctrl+C` in the terminal to stop the server.

## Project structure

```
make-24/
├── public/              Everything the browser loads
│   ├── index.html       Stage 1 projector game
│   ├── host.html        Host screen: join address, match settings, live races and scoreboard
│   ├── race.html        Player screen: up to 24 players race in pairs
│   ├── css/style.css
│   └── js/
│       ├── solver.js    Maths only: bracket-free solver and puzzle generator for 4 or 5 cards (shared with the server)
│       ├── game.js      Projector game
│       ├── host.js      Host screen (talks to the server)
│       └── race.js      Player screen (talks to the server)
├── server/
│   └── index.js         Race server: draws groups, deals puzzles, checks answers, runs matches and keeps score
├── docs/
│   └── ROADMAP.md       Stages and success criteria
├── package.json
├── LICENSE
└── README.md
```

## Licence

MIT. See [LICENSE](LICENSE).
