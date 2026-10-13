# Ganita Manjari: deploy on Vercel

The whole game is one folder. Vercel serves `index.html` and runs everything in `api/` by itself. There is nothing to install or build.

## Deploy (about 5 minutes, once)

1. Put this folder in a GitHub repo, or run `vercel` inside it. Import it in Vercel. Leave every setting on its default (Framework: Other).
2. In the Vercel project open **Storage → Create / Connect → Upstash for Redis**. Pick the free plan, connect it to the project, then **redeploy** once.

That second step is the only manual part. Vercel's servers keep no files between requests, so rooms, chat and saved answers need a small database. Connecting it adds its login details to the project automatically. The code finds them whatever the integration called them. You do not copy any key.

Until storage is connected the game still runs. Rooms then only connect tabs on one device, and the room screen says so.

## What gets saved

| What | Kept | Used by the game |
| --- | --- | --- |
| Room chat, roster, quest state | While the quest is unfinished, or while at least one squad member (not the hero) is still in the room. When the quest is won and only the hero is left, the room is deleted. A room nobody touches for 30 days expires, and a won room expires 7 days after the win. | Yes, for that room |
| How players solved each level (method counts and one-line notes) | For good, and it keeps growing | Yes. New players see real answers; sample answers only fill in while real ones are scarce |
| Problems and clues players create | For good | **Never.** No part of the game can read them back |

Players who are offline when they finish a level have their answers queued on the device and sent when the connection returns.

## Reading what was saved

Optional: add an environment variable `ADMIN_KEY` in Vercel (any long random text), redeploy, then open `/api/export?key=YOURKEY`. It downloads every saved problem and every solving record as JSON. Without `ADMIN_KEY` that address returns 404. You can also browse the data in the Upstash dashboard.

## Notes

* A room code is the only password. Anyone who has the code and picks a free name can join.
* `level15.mp3` (the compressed 46-second track, about 540 KB) plays through the castle approach and the dragon fight, and stops when the princess scene starts. Delete or replace the file to change it; without it the built-in theme plays. Use music you have the rights to if the site is public.
* `outro.mp3` (55 seconds, loops) starts the moment the princess's bars begin to lift, carries on through the walk home and stays on THE END card, and stops when the player goes back to the map. It replaces the old `home.mp3`, which is no longer used.
* Voices are optional. Put `voice-princess.mp3` ("You came.") and `voice-hero.mp3` ("Let's go home.") next to `index.html` to use real recordings. Without them the player's device speaks the two lines in its own voice (higher pitch for her, lower for him). The subtitles always show and the mute button silences everything.
* Free Upstash plan: 500K commands a month. A player in an open chat uses about 40 requests a minute and one only every 12 seconds when the tab is in the background.
* `test/` is for local testing only and is not deployed.


## Contentv
All 14 maps (story, missions, questions, how-we-teach, team twists) live in `index.html` as `UL1..UL14`, `KN` (kingdom intros) and `KE` (endings). Progress keys are `S.u["<map>.<mission>"]`; saved ways/problems use level key `<map>-<mission>`.

## Team twists (rooms)
Every mission has an entry in `TW` (inside `index.html`). In a room, troops each get a private part (SPLIT), one troop is secretly given a flawed claim (PLANTED ERROR), create-missions post the puzzle to squad chat to swap, and the hero gets a briefing and makes the final call. For missions where the question holds the hidden data, the question is blanked for everyone until the squad pools its parts (a SHOW FULL QUESTION button is the escape hatch). Solo play is unchanged.
