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

## Two-player race (Stage 2)

Two players get the same four cards at the same moment. The first to make 24 wins the round. The server checks every answer, so a win can't be faked.

You need [Node.js](https://nodejs.org) (the LTS version) installed.

```
npm install     # first time only
npm start
```

The server prints addresses like these:

```
On this computer:   http://localhost:3000/race.html
On the same Wi-Fi:  http://192.168.1.20:3000/race.html
```

Open the first on your computer and the second on the other player's device (or open both in two browser windows to try it alone). Each player types a name and presses **I'm Ready**. Press `Ctrl+C` in the terminal to stop the server.

## Project structure

```
make-24/
├── public/              Everything the browser loads
│   ├── index.html       Stage 1 projector game
│   ├── race.html        Stage 2 two-player race
│   ├── css/style.css
│   └── js/
│       ├── solver.js    Maths only: bracket-free solver and puzzle generator (shared with the server)
│       ├── game.js      Projector game
│       └── race.js      Race screen (talks to the server)
├── server/
│   └── index.js         Race server: deals puzzles, checks answers, decides who won
├── docs/
│   └── ROADMAP.md       Stages and success criteria
├── package.json
├── LICENSE
└── README.md
```

## Licence

MIT. See [LICENSE](LICENSE).
