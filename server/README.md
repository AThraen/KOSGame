# KOS race server (Live-kapsejlads)

A small Node.js process (Node 20+, only dependency `ws`) that relays boat states between players and keeps the shared start clock. Everything lives in memory: no database, no logs of names. It listens on `127.0.0.1` and runs behind your existing nginx. The game works fully without it.

Two instances run side by side: **prod** (port 8787, `/mp/`, status `/mp-status.json`) and **test** (port 8788, `/mp-test/`, status `/mp-test-status.json`).

Layout: `index.js` (http + ws), `lib/` (rooms, protocol, limits, status), `bin/kos-race` (on/off switch), `deploy/` (systemd unit, nginx snippet, example status file). Protocol: `docs/specs/live-race.md`.

## Install on Ubuntu

1. Node 20+: `node -v` (otherwise `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs`).
2. Copy the `server/` folder to the machine, e.g. `/opt/kos-race/server` (preferably `git clone` on the server; if you copy from Windows, make sure the files keep LF line endings, otherwise run `find /opt/kos-race/server -path "*/node_modules" -prune -o -type f -print0 | xargs -0 sed -i 's/\r$//'`):
   ```
   sudo mkdir -p /opt/kos-race
   sudo cp -r server /opt/kos-race/
   cd /opt/kos-race/server && sudo npm install --omit=dev
   sudo chown -R root:root /opt/kos-race
   ```
3. Status files (nginx serves them; the server and `kos-race` read them). Start hidden:
   ```
   sudo cp /opt/kos-race/server/deploy/mp-status.example.json /var/www/html/mp-status.json
   sudo cp /opt/kos-race/server/deploy/mp-status.example.json /var/www/html/mp-test-status.json
   ```
4. Environment per instance:
   ```
   sudo mkdir -p /etc/kos-race
   echo 'KOS_STATUS_FILE=/var/www/html/mp-status.json'      | sudo tee /etc/kos-race/8787.env
   echo 'KOS_STATUS_FILE=/var/www/html/mp-test-status.json' | sudo tee /etc/kos-race/8788.env
   ```
   Optional: `KOS_ORIGINS` (comma-separated hostnames allowed as browser Origin; default `spil.kossejlsport.dk,athraen.github.io,localhost,127.0.0.1`), `KOS_MAX_ROOMS` (40), `KOS_MAX_PLAYERS` (24), `KOS_MAX_CONNS` (300), `KOS_MAX_PER_IP` (20).
5. systemd (one template unit, the instance name is the port):
   ```
   sudo cp /opt/kos-race/server/deploy/kos-race@.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now kos-race@8787 kos-race@8788
   curl -s http://127.0.0.1:8787/health ; curl -s http://127.0.0.1:8788/health
   ```
6. nginx: copy `deploy/nginx-mp.conf` to `/etc/nginx/snippets/kos-mp.conf` (NOT `conf.d/`: nginx auto-loads every `conf.d/*.conf` at http level, where `location` is not allowed). Add `include /etc/nginx/snippets/kos-mp.conf;` inside the `server { ... }` block of the game site (the one with `listen 443 ssl` and `server_name spil.kossejlsport.dk`), then `sudo nginx -t && sudo systemctl reload nginx`. The status files must be in that site's `root` (step 3 assumes `/var/www/html`; adjust the paths in step 3 and in `/etc/kos-race/*.env` if the root differs). Check: `curl -s https://spil.kossejlsport.dk/mp-test-status.json`. The client connects to `wss://<host>/mp/ws` (test: `/mp-test/ws`).
7. The control script:
   ```
   sudo install -m 755 /opt/kos-race/server/bin/kos-race /usr/local/bin/kos-race
   ```
   The test instance has its own status file: `KOS_STATUS_FILE=/var/www/html/mp-test-status.json KOS_HEALTH_URL=http://127.0.0.1:8788/health kos-race status`.

## Switching it on and off

```
sudo kos-race on                      # visible, hosting allowed
sudo kos-race closed "Pause i dag"    # entry greyed with the message; running races continue
sudo kos-race hidden                  # entry hidden in the game
kos-race status                       # mode, message, rooms, players, connections, memory
```
`kos-race` writes the status JSON atomically; the server notices the change within seconds (`fs.watch` + 5 s poll). A missing or broken file means `hidden`. `closed`: new rooms are refused, existing lobbies and races are untouched. `hidden`: joining is refused too.

## Minimum game version (the version gate)

Old builds in the field have broken races (v0.8.3 lost its boat on a wifi-to-cellular switch). The game sends its version, build and protocol level in `hello`; the server can refuse builds that are too old:

```
sudo kos-race min 0.8.5       # builds below 0.8.5, and builds that send no version (v0.8.4 and older), are refused
sudo kos-race min 0.8.5 2     # ... and clients below protocol level 2 (the current game sends level 2)
sudo kos-race min off         # lift it
kos-race min                  # show it;  kos-race status shows mode, message, minClient, minProto, health
```
The same thing by hand in the status file (`/var/www/html/mp-status.json`): `{"mode":"on","message":"","maxRooms":40,"maxPlayers":24,"minClient":"0.8.5","minProto":2}`; the server watches the file like `mode`, so no restart is needed. Environment alternatives: `KOS_MIN_CLIENT=0.8.5`, `KOS_MIN_PROTO=2` (the stricter of file and env wins). A missing minimum, or one that cannot be parsed, means no gate. Dev builds (version `dev`) are only held to `minProto`.

A refused client gets `err code:'old'` on `hello`, `create` or `join` and the new game shows "A new version of the game is out - update to join" with an update button that reloads the game and continues into the same join. Old clients never crash the server: they are simply closed. The public status file is also read by the game, so a phone that is below the minimum is told before it even connects. Raise the minimum between races: a refused build cannot reconnect, so do not do it while people are racing on it.

## Rejoining

A seat belongs to its rejoin key for the whole life of the room (lobby, countdown, race, results): a phone that was closed, swiped away or killed can come back with `resume` and gets the boat's last known state and the race clock (`me`). While the seat is away the boat stays on the others' maps as "lost" (`Mistet forbindelsen`). A lobby seat waits 20 s (`KOS_LOBBY_GRACE_MS`); racing seats wait until the race ends. The race ends for the others when every boat still out is a seat that has been gone for 2 minutes, or by the finish window / host / `maxS` as before; unfinished boats are DNF. Leaving on purpose or being kicked ends the right to rejoin. The number of seats stays limited by `maxP`; the key is never part of the room info sent to other players.

## Safety limits

Frames at most 2048 bytes, state frames 10-14 per second per player, other messages 10/s, 3 bad frames close the connection, per-IP and total connection caps, 40 rooms, 24 players per room, idle connections closed after 60 s, rooms removed after 30 min in the lobby / 2 h at most. `GET /health` only answers on loopback and without proxy headers; it returns counts only.

## Update / troubleshooting

- Update: copy new files, `npm install --omit=dev`, `sudo systemctl restart kos-race@8788` (test first), then `kos-race@8787`. Restarting drops running races (clients continue locally, results marked unofficial).
- Logs: `journalctl -u kos-race@8787 -f`.
- Local run: `cd server && npm install && PORT=8788 KOS_STATUS_FILE=/tmp/s.json node index.js`.
- Tests (from the repo root): `node tools/run-tests.js liveserver`.
