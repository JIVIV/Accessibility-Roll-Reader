# Accessibility: Roll Reader

A Foundry VTT module that speaks dice rolls and chat messages aloud, so
blind and low-vision players can follow the game without someone reading
every result to them.

Free, and always will be. It uses the speech engine already built into
your browser — no account, no API key, nothing to pay for.

## Why this exists

Foundry's chat log is reachable by a screen reader, but a roll message
is a tangle of markup: dice icons, tooltips, a breakdown of each part,
and the total repeated in several places. Read literally, it's noise.

This module ignores the rendering and composes a sentence from the
underlying roll data instead, so you hear:

> Alice. Attack Roll. total 18.

There are several excellent text-to-speech modules for Foundry, but
they are all built for immersion — giving NPCs characterful AI voices,
triggered manually by the GM. This one is built to tell you what just
happened, automatically.

## Installing

In Foundry, go to **Add-on Modules → Install Module** and paste the
manifest URL from the latest release. Then enable it in your world under
**Manage Modules**.

## Using it

Every setting is per-player. Turning it on affects only you — enabling
it as one player at the table does not switch it on for everyone.

Open **Configure Settings → Module Settings** and turn on **Read
messages aloud**. Changing the voice, rate, pitch, or volume speaks a
short sample immediately so you can tune it by ear.

### What gets announced

| Setting | Default | What it does |
| --- | --- | --- |
| Announce dice rolls | on | Speak the result whenever dice are rolled |
| Announce chat messages | on | Speak ordinary chat and emotes too |
| Announce my own messages | on | Also speak what you sent yourself, confirming what actually went through |
| Announce hidden rolls | on | Say that a secret roll happened, without the result |
| Say who is speaking | on | Prefix with the character or player name |
| Say when a message is whispered | on | Announce that a message was private, and who it went to |
| Say the dice formula | off | Read "1 d 20 plus 5" before the result |
| Say individual dice | off | Read each kept die, not only the total |

### Keyboard shortcuts

| Action | Default |
| --- | --- |
| Stop speaking | `Alt` + `S` |
| Repeat last announcement | `Alt` + `R` |
| Open player speech settings (GM only) | `Alt` + `Shift` + `R` |

All are rebindable under **Configure Controls**.

**Stop speaking** cuts off the current announcement and clears anything
queued behind it — useful when a long roll breakdown is running and you
want to move on. To see it work, turn on "Say the dice formula" and "Say
individual dice" so announcements run long, then press it partway
through.

## Whispers

Whispers are announced as whispers — "Bob whispers to you" — because
spoken aloud a private message otherwise sounds exactly like public
chat, and there is no way to tell that a reply would be seen by the
whole table.

They also have their own **Whisper volume** setting, so private messages
can be set apart by ear as well as by wording.

## Setting it up for someone else

The player most likely to need this module is also the one most likely
to find Foundry's settings menus hard to navigate. Asking someone to
work through nested menus and sliders in order to switch on the tool
that would help them navigate is backwards.

So a GM can do it for them. Press `Alt` + `Shift` + `R`, or run:

```js
game.modules.get('a11y-roll-reader').api.openGmPanel();
```

Pick a connected player, choose their settings, and apply. Their client
applies the change and **says so out loud**, so they get confirmation
without having to read a notification.

Two things worth knowing: the player must be connected at the time, and
the voice list shown is the GM's own, because voices come from each
person's device. If the chosen voice isn't installed for that player,
their browser default is used instead.

### Dice So Nice

If you use Dice So Nice, results are announced before the dice finish
animating. Set **Delay before speaking** to roughly your animation
length to line them up.

## Privacy

Messages you aren't allowed to see are never spoken. The module defers
to Foundry's own visibility rules, so whispers to other players and
concealed GM rolls stay silent rather than being read out to the room.

Hidden rolls announce only that a roll happened — never the result.

## For macro authors

```js
const api = game.modules.get('a11y-roll-reader').api;
api.speak('Something worth hearing');
api.stop();
api.repeatLast();
```

## Requirements and limitations

- Foundry VTT v13 or v14.
- Needs a browser with the Web Speech API — Chrome, Edge, Safari, and
  Firefox all provide it. **The Foundry desktop application may not**,
  in which case connect through a browser instead. The module warns you
  on startup if speech is unavailable rather than failing silently.
- Available voices come from your operating system, so the list differs
  between Windows, macOS, and Linux.

## Contributing

Bug reports from screen reader users are especially welcome — if
something reads badly or an important message goes unspoken, please open
an issue and say what you expected to hear.

## License

MIT. See [LICENSE](LICENSE).
