# Make 24

A classroom maths game. Combine four numbers from 1 to 9 with +, −, × and ÷ to make exactly 24.

## How to play

Click a card, then an operation, then another card to combine them. Keep going until one card is left. If it's 24, you've solved it.

Cards are always whole numbers, and every puzzle can be solved without brackets.

Keyboard: `1`–`4` pick a card · `+ - * /` pick an operation · `Backspace` undo · `R` reset

## Projector game

Open `public/index.html` in a browser. No server or internet needed.

## Class race

1. The teacher opens the **host screen** (`/host.html`, or the **Host a Game** button on the home page), which shows a lobby code.
2. Up to 24 students open the game's website, type the code, pick an emoji and type their name.
3. The teacher chooses the game mode, the number of cards (4 or 5) and, for a points game, the number of rounds (1–10), then presses **Start Match**.

Each round, students race in pairs (plus one group of three if needed, shared around so it isn't always the same students) with the same cards. Rounds last 30 seconds and the next one starts by itself. Speed is timed on each student's own device, so a slow connection doesn't cost points.

There are two game modes:

- **Points:** faster answers score more points, with a bonus for finishing first in your group. Most points after the last round wins.
- **Elimination:** everyone starts with 3, 4 or 5 lives (the host chooses). The first in each group to make 24 keeps their lives and everyone else in the group loses one. If nobody in a group makes 24, they all lose one. Players on 0 lives are out, but keep getting the same cards to practise on for fun. The last player standing wins.

Win your race three rounds in a row and you get to **steal**: pick another player and take 300 points from them (in Elimination, a life from someone with two or more). A small terminal-style window on every screen lists who beat whom in each race, and any steals, as they happen.

Each player's emoji shows next to their name. It bounces when they win their race (or the match) and droops when they lose.

The lobby closes when the match starts. If a student's connection drops or they reload the page, their screen rejoins by itself and they keep their seat, score and lives. Students on a different device can rejoin by typing exactly the same name.

**Host controls:** rename players in the waiting room, **Pause** after the current round (and **Resume**), **Bonk** a suspected cheat (press twice to confirm: −500 points, or one life in elimination), and **End Game** at any time. The match ends with a scoreboard and podium.

## Running it

**Online:** the game runs on [Render](https://render.com) using the included `render.yaml`. In Render, choose **New → Blueprint** and pick this repository. Every push to `main` redeploys it.

**On your own computer:** install [Node.js](https://nodejs.org), then run:

```
npm install     # first time only
npm start
```

Open `http://localhost:3000/host.html`. Students on the same Wi-Fi join at the address the server prints.

## Testing

The class test plays two whole classes at the same time (24 players each, 10 rounds) and checks that nothing breaks. During the matches it drops connections, reloads pages, pauses, bonks, steals, floods card taps, tries to sneak into a closed lobby and checks the scores every round. Two small extra classes play alongside: one with an odd number of players (to check the group of three is shared around) and an Elimination class (to check knocked-out players can keep practising). It takes about 7 minutes.

```
npm install                        # first time only
npx playwright install chromium    # first time only
npm run test:class
```

It ends with a report: **Everything passed**, or a list of what failed. Options go after `--`, for example `npm run test:class -- --rounds 5`:

- `--classes N` classes playing at once (default 2)
- `--players N` players per class, 16–24 (default 24)
- `--rounds N` rounds per match (default 10; all the checks need at least 9)
- `--url URL` test the live site instead of a copy on your computer
- `--shots FOLDER` save screenshots of the host and player screens

## Project structure

```
make-24/
├── public/        Browser files: projector game, host screen, player screen
├── server/        Game server and lobbies
├── tests/         Class test (whole classes playing at once)
├── outputs/       Preview images
├── render.yaml    Hosting settings for Render
└── package.json
```

## Licence

MIT. See [LICENSE](LICENSE).
