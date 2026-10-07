# Make 24

A classroom maths game. Students get four numbers from 1 to 9 and combine them with +, −, × and ÷ to make exactly 24.

The project grows in stages, from a single game projected on the board (Stage 1) to an online race for a whole class, with lobby codes (Stage 6). See [docs/ROADMAP.md](docs/ROADMAP.md).

## How to play

1. Click a card, then an operation, then another card. The two cards combine into one.
2. Keep combining until one card is left. If it's 24, you've solved it.

Cards are always whole numbers, so ÷ only works when it divides exactly. Every puzzle has at least one solution that can be written in one line without brackets, using the normal order of operations, for example 8 3 2 2 → 3 × 8 + 2 − 2.

Keyboard: `1`–`4` pick a card · `+ - * /` pick an operation · `Backspace` undo · `R` reset

## Projector game (Stage 1)

Open `public/index.html` in any modern browser. It doesn't need a server or an internet connection. Extra keys: `N` or `F2` new puzzle · `S` reveal solution · `F1` help.

## Class race (Stages 2–4 and 6)

The teacher opens the **host screen**, which creates a lobby with a five-character code (like `KQ7PX`) shown in large letters for the projector. Up to 24 players go to the game's website on their own devices, type the code and their name, and join that lobby. One server can run many lobbies at once, so several classes can play at the same time without seeing each other. The lobby closes as soon as the host presses **Start Match**, so a code passed to another class won't work. A player who drops out (for example, their phone locks) can rejoin by typing the same code and the same name, and gets their score back. The lobby opens again when the host returns to the waiting room.

Each round everyone is drawn into pairs, with one group of three when the number of players is odd (6 players → 3 pairs, 7 → 2 pairs and a three, 19 → 8 pairs and a three). Opponents change every round, avoiding repeat pairings where possible.

Every group gets the same cards at the same moment: 4 or 5 of them (the host chooses), and every card must be used to make 24. Everyone who makes 24 within the time limit scores, and the first in each group wins the race; the server checks every answer, so a score can't be faked. A round lasts at most 30 seconds; anyone still working when time runs out sees their cards grey out under a big “Out of time!” before the results appear. Your opponents' cards are shown face down beside yours and animate as they play, without revealing their numbers.

The host screen (`/host.html`) doesn't play: it shows the join address and lobby code, lets you choose the number of cards (4 or 5) and the match length (1 to 10 rounds), and has the **Start Match** button. During a round it shows the cards, the time left, every race and a live scoreboard. If the host screen is refreshed or loses its connection, it takes back the same lobby. When a player makes 24, their cards cascade across the table and the scoreboard appears on top, updating live while the others finish. After each round the results and scoreboard appear on every screen with a 3-second countdown, then the next round starts by itself. Players never need to press a button between rounds: the next round, or the host's next match, clears their screen.

Host controls:

- **Rename players**: in the waiting room, click ✎ next to a name to change it (for example if a name is inappropriate). The player sees their new name.
- **Bonk**: if you suspect a player is cheating, press **Bonk** next to their name on the host scoreboard to take 500 points from them (never below 0). Their name and score bar shake with a “BONK!” that floats away, on the host screen and on everyone's results, and the player is told they were bonked. Each player's bonk count is shown on the scoreboard.
- **End Game**: stops the match at any point, after a confirmation. Races still going stop, points already scored count, and the scoreboard at that moment becomes the final result on every screen.

When a match ends (after the last round or with End Game), the host screen switches to a results view: a large scoreboard with a podium for the top three underneath.

**Scoring:** making 24 scores 1,000 points for an instant answer, dropping steadily to 500 at 30 seconds (about 17 points per second), plus a 100-point bonus for finishing first in your group. Players who don't make 24 in time, or give up, score nothing that round. Everyone's points go into one shared scoreboard of progress bars, shown after every round; the final one names the match winner. Players who join mid-round sit out until the next one.

### Running it online (Stage 6)

The game runs on [Render](https://render.com) as one small paid web service (the Starter instance). The repository includes a `render.yaml` blueprint with the settings.

1. Sign in to Render with your GitHub account.
2. Choose **New → Blueprint**, pick this repository and confirm. (Or **New → Web Service** with build command `npm install`, start command `npm start`, instance type **Starter**.)
3. When it's live, Render gives the site an address like `https://make-24.onrender.com`.
4. The teacher opens `…/host.html` on the projector computer; players open the address itself and type the lobby code.

Every push to the repository's main branch redeploys the game automatically. Empty lobbies are cleared away after 10 minutes.

### Running it on your own computer

You need [Node.js](https://nodejs.org) (the LTS version) installed.

```
npm install     # first time only
npm start
```

The server prints addresses like these:

```
Host screen (open on your computer):  http://localhost:3000/host.html
Players join at (same Wi-Fi):         http://192.168.1.20:3000/
```

Open the host screen on your computer and give players the Wi-Fi address and lobby code it shows (or open several browser windows to try it alone). Press `Ctrl+C` in the terminal to stop the server.

## Project structure

```
make-24/
├── public/              Everything the browser loads
│   ├── index.html       Stage 1 projector game
│   ├── host.html        Host screen: lobby code, match settings, live races and scoreboard
│   ├── race.html        Player screen (the site's home page): enter a lobby code and race
│   ├── css/style.css
│   └── js/
│       ├── solver.js    Maths only: bracket-free solver and puzzle generator for 4 or 5 cards (shared with the server)
│       ├── game.js      Projector game
│       ├── host.js      Host screen (talks to the server)
│       └── race.js      Player screen (talks to the server)
├── server/
│   ├── index.js         Web server and lobby manager: creates lobby codes, lets players join by code
│   └── room.js          One lobby's game: draws groups, deals puzzles, checks answers, runs matches and keeps score
├── docs/
│   └── ROADMAP.md       Stages and success criteria
├── package.json
├── render.yaml          Settings for hosting on Render
├── LICENSE
└── README.md
```

## Licence

MIT. See [LICENSE](LICENSE).
