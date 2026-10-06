# Make 24

A classroom maths game. Students get four numbers from 1 to 9 and combine them with +, −, × and ÷ to make exactly 24.

The project grows in stages, from a single game projected on the board (Stage 1) to an online race for a whole class, with lobby codes (Stage 5). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Play (Stage 1)

Open `public/index.html` in any modern browser. It doesn't need a server or an internet connection.

1. Click a card, then an operation, then another card. The two cards combine into one.
2. Keep combining until one card is left. If it's 24, you've solved it.
3. Use **Undo**, **Reset**, **Reveal solution** or **Next puzzle** as needed.

Keyboard: `1`–`4` pick a card · `+ - * /` pick an operation · `Backspace` undo · `R` reset · `N` next · `S` reveal · `Esc` close the panel

Cards are always whole numbers, so ÷ only works when it divides exactly. Every puzzle has at least one solution that can be written in one line without brackets, using the normal order of operations, for example 8 3 2 2 → 3 × 8 + 2 − 2.

## Project structure

```
make-24/
├── public/              Everything the browser loads
│   ├── index.html       Stage 1 projector game
│   ├── css/style.css
│   └── js/
│       ├── solver.js    Maths only: fractions, solver, puzzle generator (shared with the server later)
│       └── game.js      Single-screen game UI
├── docs/
│   └── ROADMAP.md       Stages and success criteria
├── LICENSE
└── README.md
```

Planned additions for Stage 2 onwards:

```
├── server/              Node.js game server (lobbies, rounds, scoring)
├── public/host.html     Teacher screen: join code, live scoreboard
├── public/play.html     Student screen (phone-friendly)
└── package.json
```

## Licence

MIT. See [LICENSE](LICENSE).
