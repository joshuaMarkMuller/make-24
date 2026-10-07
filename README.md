# Make 24

A classroom maths game. Combine four numbers from 1 to 9 with +, −, × and ÷ to make exactly 24.

## How to play

Click a card, then an operation, then another card to combine them. Keep going until one card is left. If it's 24, you've solved it.

Cards are always whole numbers, and every puzzle can be solved without brackets.

Keyboard: `1`–`4` pick a card · `+ - * /` pick an operation · `Backspace` undo · `R` reset

## Projector game

Open `public/index.html` in a browser. No server or internet needed.

## Class race

1. The teacher opens the **host screen** (`/host.html`), which shows a lobby code.
2. Up to 24 students open the game's website, type the code, pick an emoji and type their name.
3. The teacher chooses the game mode, the number of cards (4 or 5) and, for a points game, the number of rounds (1–10), then presses **Start Match**.

Each round, students race in pairs (plus one group of three if needed) with the same cards. Rounds last 30 seconds and the next one starts by itself. Faster answers score more points, with a bonus for finishing first in your group.

There are two game modes:

- **Points:** faster answers score more points, with a bonus for finishing first in your group. Most points after the last round wins.
- **Elimination:** everyone starts with 3 lives. The first in each group to make 24 keeps their lives and everyone else in the group loses one. If nobody in a group makes 24, they all lose one. Players on 0 lives are out and watch the rest. The last player standing wins.

Each player's emoji shows next to their name. It bounces when they win their race (or the match) and droops when they lose.

The lobby closes when the match starts. Students who drop out can rejoin with the same name.

**Host controls:** rename players in the waiting room, **Bonk** a suspected cheat (−500 points, or one life in elimination), and **End Game** at any time. The match ends with a scoreboard and podium.

## Running it

**Online:** the game runs on [Render](https://render.com) using the included `render.yaml`. In Render, choose **New → Blueprint** and pick this repository. Every push to `main` redeploys it.

**On your own computer:** install [Node.js](https://nodejs.org), then run:

```
npm install     # first time only
npm start
```

Open `http://localhost:3000/host.html`. Students on the same Wi-Fi join at the address the server prints.

## Project structure

```
make-24/
├── public/        Browser files: projector game, host screen, player screen
├── server/        Game server and lobbies
├── outputs/       Preview images
├── render.yaml    Hosting settings for Render
└── package.json
```

## Licence

MIT. See [LICENSE](LICENSE).
