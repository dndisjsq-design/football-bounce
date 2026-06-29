# Software Design Document

Project: football-bounce

Document owner: engineering

Last updated: 2026-06-20

## 1. Purpose

This document records the implemented software behavior, API contracts, database-backed features, client modules, and known technical debt for the current football-bounce codebase.

In large engineering organizations this type of document is usually called a Software Design Document, SDD, Technical Design Document, or Low-Level Design document. This project uses Software Design Document because the document focuses on concrete modules, interfaces, request/response shapes, and implementation behavior.

Every commit that changes behavior, APIs, persistence, gameplay, or user-visible screens should update the Change Log section in this file.

## 2. Runtime Components

### 2.1 Client

Path: `client/`

Framework: Cocos Creator 3.8.8.

Primary scripts:

- `assets/scripts/App.ts`: scene entry, match bootstrap, replay bootstrap, online match handoff.
- `assets/scripts/scenes/LoginSceneController.ts`: login page UI and login/register/guest entry.
- `assets/scripts/scenes/RegisterSceneController.ts`: registration page UI.
- `assets/scripts/scenes/MainSceneController.ts`: main tabs, home, lineup, shop entry, match record entry, online matchmaking entry.
- `assets/scripts/scenes/PlayersSceneController.ts`: player/lineup related scene behavior.
- `assets/scripts/scenes/ShopSceneController.ts`: shop category page.
- `assets/scripts/scenes/ShopPackSceneController.ts`: gacha pack page and draw animation.
- `assets/scripts/match/EditableMatch.ts`: match field rendering, local input, local physics display, single match integration, online match integration, replay playback.
- `assets/scripts/MatchTypes.ts`: shared client-side match DTO types.
- `assets/scripts/MatchTransport.ts`: local and online transport abstraction for match command/result flow.
- `assets/scripts/ui/PlayerCardView.ts`: reusable player card rendering.
- `assets/scripts/services/*.ts`: HTTP services and local client state services.

### 2.2 Server

Path: `server/`

Framework: Spring Boot 3.3.5, Java 17, MyBatis-style mapper layer.

Layering:

- Controller layer: HTTP endpoint entry.
- Service layer: business logic, match runtime, settlement, rewards.
- Repository layer: database access mappers.
- Domain/DTO layer: persistence models and request/response records.

### 2.3 Database

Database: MySQL.

Schema source: `server/src/main/resources/db/schema.sql`.

Primary tables:

- `user_account`: registered and guest users, coins, match counters.
- `guest_account_template`: reset template for guest account.
- `user_login_session`: one-device/session control.
- `player_data`: player catalog and detail attributes.
- `formation_catalog`: formation catalog and formation point JSON.
- `user_owned_player`: user-player ownership.
- `user_owned_formation`: user-formation ownership.
- `user_lineup`: selected formation and five selected player slots.
- `coin_transaction`: coin ledger.
- `user_match_record`: match summary rows.
- `match_action`: replay-oriented action records.
- `match_goal_record`: goal timeline and settlement source.

## 3. Shared API Envelope

Most business APIs return either feature-specific DTOs or:

```json
{
  "ok": true,
  "message": "ok",
  "data": {},
  "userSummary": {}
}
```

`userSummary` is used as an immediate client cache refresh signal after operations that can change user information, especially coin balance.

## 4. Authentication And Session Design

Base path: `/api/auth`

Client service: `assets/scripts/services/AuthService.ts`

Server controller: `AuthController`

Server service: `UserService`, `GuestAccountService`

### 4.1 POST `/api/auth/login`

Request:

```json
{
  "username": "string",
  "password": "string",
  "deviceId": "string",
  "clientInstanceId": "string"
}
```

Response: `AuthResponse`

Important fields:

- `ok`: login success flag.
- `code`: success, password error, user not found, or session state code.
- `message`: user-visible message.
- `user`: user identity and profile.
- `authToken`: session token for authenticated calls.
- `expiresAt`: token expiry.

Implementation:

- Passwords are hashed server-side.
- The server writes a `user_login_session` row for the device.
- Existing session rows are used to enforce device/session identity.
- Client stores current user id, display name, token, device id, guest session id, and client instance id in `AuthService`.

### 4.2 POST `/api/auth/auto-login`

Request:

```json
{
  "deviceId": "string",
  "authToken": "string",
  "clientInstanceId": "string"
}
```

Response: `AuthResponse`

Implementation:

- Server hashes the token and validates it against `user_login_session`.
- Revoked or expired sessions fail.
- On success, server refreshes last-used metadata.

### 4.3 POST `/api/auth/logout`

Request:

```json
{
  "deviceId": "string",
  "authToken": "string",
  "clientInstanceId": "string"
}
```

Response: `AuthResponse`

Implementation:

- Server revokes the matching login session.
- Guest behavior is reset through guest-specific flows.

### 4.4 POST `/api/auth/register`

Request:

```json
{
  "username": "string",
  "password": "string"
}
```

Response: `AuthResponse`

Implementation:

- New accounts are inserted into `user_account`.
- New accounts default to 6000 coins.
- New accounts receive baseline owned players and baseline lineup data through `LineupService`.

### 4.5 POST `/api/auth/guest/reset`

Request:

```json
{
  "userId": 1,
  "guestSessionId": "string"
}
```

Response: `ApiResponse<Void>`

Implementation:

- Guest user is user id `1`.
- Guest reset restores the profile from `guest_account_template`.
- Current template name is `visiter`.
- Guest reset restores default coins, blue/purple ownership, and selected `defense-311` lineup policy.

## 5. Lineup Design

Base path: `/api/lineup`

Client service: `LineupApiService.ts`

Server controller: `LineupController`

Server service: `LineupService`

### 5.1 GET `/api/lineup/state?userId={id}`

Response:

```json
{
  "userId": 2,
  "selectedFormationId": "defense-311",
  "formationIds": ["balanced-221", "defense-311"],
  "lineupPlayerIds": ["p1", "p2", "p3", "p4", "p5"],
  "players": [
    {
      "id": "string",
      "name": "string",
      "score": 80,
      "rarity": "blue",
      "avatarSeed": 1
    }
  ]
}
```

Implementation:

- Server fetches owned formation ids from `user_owned_formation`.
- Server fetches owned players from `user_owned_player` and `player_data`.
- Server sorts players by rarity strength and score.
- Client lineup page should display empty content if this request fails; no frontend-owned player fallback is allowed for backend-owned data.

### 5.2 POST `/api/lineup/state`

Request:

```json
{
  "userId": 2,
  "selectedFormationId": "defense-311",
  "lineupPlayerIds": ["p1", "p2", "p3", "p4", "p5"]
}
```

Response: same as GET state.

Implementation:

- Server validates selected formation and player ids against user ownership.
- Server updates `user_lineup`.
- Match entry reads this lineup to build player disks.

## 6. Shop And Gacha Design

Base path: `/api/shop`

Client service: `ShopCatalogApiService.ts`

Server controller: `ShopCatalogController`

Server service: `ShopService`

### 6.1 GET `/api/shop/players`

Response: array of `LineupPlayerDto`.

Implementation:

- Reads all players from `player_data`.
- Used by shop lists and pack content display.

### 6.2 GET `/api/shop/players/{playerId}`

Response: `ShopPlayerDetailDto`

Fields include:

- id, name, score, rarity, avatarSeed
- price
- intro
- bodyType
- nationality
- club
- height
- weight
- age
- skills
- power
- accuracy
- curve
- stamina
- bodyStrength

Implementation:

- Frontend player detail pages must request this endpoint; frontend should not carry complete player detail data as fallback.

### 6.3 POST `/api/shop/purchase-player`

Request:

```json
{
  "userId": 2,
  "playerId": "string"
}
```

Response:

```json
{
  "ok": true,
  "message": "ok",
  "data": {
    "itemId": "playerId",
    "price": 100
  },
  "userSummary": {}
}
```

Implementation:

- Server calculates price by rarity and score.
- Server checks ownership and coin balance.
- Server inserts `user_owned_player`.
- Server deducts coins and writes `coin_transaction`.
- Response carries `userSummary` so the top user info bar can update coins.

### 6.4 POST `/api/shop/purchase-formation`

Request:

```json
{
  "userId": 2,
  "formationId": "string"
}
```

Implementation:

- Server checks formation existence, ownership, and coin balance.
- Formation prices: 3-player formations 100, 4-player formations 500, 5-player formations 1000.
- Server writes `user_owned_formation`, deducts coins, and returns `userSummary`.

### 6.5 POST `/api/shop/draw-pack`

Request:

```json
{
  "userId": 2,
  "packId": "string",
  "count": 1
}
```

Response:

```json
{
  "ok": true,
  "message": "ok",
  "data": {
    "packId": "string",
    "count": 10,
    "price": 1000,
    "players": []
  },
  "userSummary": {}
}
```

Implementation:

- Single draw costs 100.
- Ten draw costs 1000.
- Current temporary red probability has been changed during testing and must be confirmed before production balance.
- Draw result returns transient player cards for display.
- Persisted ownership and duplicate handling must remain server-owned.

## 7. Match Types And Shared DTOs

Client shared file: `MatchTypes.ts`

Important DTOs:

- `ShootCommand`: command id, actor id, side, angle, power, curve, field size, client tick.
- `MatchSnapshot`: match id, mode, field width/height, tick, turn, score, players, ball.
- `MatchClockState`: server time, match remaining, turn remaining, turn, control flag.
- `MatchEvent`: shoot, goal, match-end event payload.

Field size rules:

- Client includes current `fieldWidth` and `fieldHeight` in online commands and snapshots.
- Server normalizes incoming snapshots to canonical `362x650`.
- Server mirrors away snapshots and commands by 180 degrees.
- Snapshot validation does not compare `tick`.
- Snapshot comparison has tolerance: position 18.0, velocity 12.0.

## 8. Single Match Design

Base path: `/api/single-match`

Client service: `SingleMatchService.ts`

Server controller: `SingleMatchController`

Server service: `SingleMatchService`

### 8.1 POST `/api/single-match/start`

Request:

```json
{
  "userId": 2,
  "clientSessionId": "string",
  "fieldWidth": 362,
  "fieldHeight": 650
}
```

Response includes:

- matchId
- user id and username
- homeFormationId
- awayFormationId
- homeLineup
- awayLineup
- initial snapshot

Implementation:

- Server creates an in-memory `ServerMatchState`.
- Server reads the user's lineup.
- AI lineup mirrors the user lineup for current single-player behavior.
- Initial positions are generated from formation ratios and field dimensions.

### 8.2 POST `/api/single-match/shoot`

Request:

```json
{
  "matchId": "string",
  "command": {}
}
```

Response:

- `ok`
- `message`
- `expectedSnapshot`

Implementation:

- Server validates turn and actor.
- Server applies command, simulates until settled, records action, and returns expected snapshot.

### 8.3 POST `/api/single-match/ai-shoot`

Request:

```json
{
  "matchId": "string",
  "phase": "normal",
  "actorId": "optional",
  "actorX": 0,
  "actorY": 0
}
```

Implementation:

- Server chooses AI actor and shot.
- Normal mode aims at ball.
- Penalty mode uses penalty-specific target logic.

### 8.4 POST `/api/single-match/ai-keeper`

Request:

```json
{
  "matchId": "string"
}
```

Response:

```json
{
  "ok": true,
  "message": "ok",
  "direction": 0
}
```

Implementation:

- Server returns keeper direction: -1, 0, or 1.

### 8.5 POST `/api/single-match/snapshot`

Request:

```json
{
  "matchId": "string",
  "phase": "settled",
  "snapshot": {}
}
```

Implementation:

- Validates client snapshot against server-calculated state.
- Used for current anti-cheat validation in single mode.

### 8.6 POST `/api/single-match/event`

Records match event data. Current replay persistence should retain only replay-useful actions/events.

### 8.7 POST `/api/single-match/finish`

Request:

```json
{
  "matchId": "string",
  "durationSeconds": 180,
  "score": {"home": 3, "away": 1},
  "result": "win",
  "resultScore": "3 : 1"
}
```

Implementation:

- Server records match result.
- Server records goals and settlement data.
- Server applies match rewards through reward service.
- Single-player win reward is capped by daily Beijing-time limit.

### 8.8 POST `/api/single-match/abandon`

Request:

```json
{
  "matchId": "string",
  "userId": 2
}
```

Implementation:

- Current code preserves unfinished match records rather than deleting them. This behavior should be reviewed against product requirements.

## 9. Online Match Design

Base path: `/api/online-match`

Client service: `OnlineMatchService.ts`

Client transport: `MatchTransport.ts`

Server controller: `OnlineMatchController`

Server service: `OnlineMatchService`

### 9.1 POST `/api/online-match/join`

Request:

```json
{
  "userId": 2,
  "requestId": "mm-xxx",
  "guestSessionId": "string",
  "deviceId": "string",
  "authToken": "string",
  "clientInstanceId": "string"
}
```

Response: `MatchmakingResponse`

Statuses:

- `WAITING`
- `MATCHED`
- `CANCELLED`
- `EXPIRED`
- `ERROR`

Implementation:

- Server keeps an in-memory waiting slot.
- First player waits.
- Second player creates match.
- Current assignment: first player is home, second player is away.
- Both clients render themselves as local home/red side.
- Server uses network home/away and converts away input/output.

### 9.2 POST `/api/online-match/status`

Request: user/session fields plus `requestId`.

Implementation:

- Polls matchmaking status.
- Returns matched data after pairing.

### 9.3 POST `/api/online-match/cancel`

Cancels waiting request.

### 9.4 POST `/api/online-match/shoot`

Request:

```json
{
  "userId": 2,
  "requestId": "mm-xxx",
  "matchId": "online-xxx",
  "commandId": "shoot-xxx",
  "actorId": "home-1",
  "side": "home",
  "angleRad": 0,
  "power": 0.8,
  "curveAngleRad": 0,
  "curveDistance": 0,
  "fieldWidth": 362,
  "fieldHeight": 650,
  "clientTick": 0,
  "deviceId": "string",
  "authToken": "string",
  "clientInstanceId": "string"
}
```

Implementation:

- Server validates session and match membership.
- Server checks turn, actor ownership, command power limit, and command curve limit.
- Server converts local command to canonical command.
- If actor is away, server swaps ids and rotates vectors by 180 degrees.
- Server normalizes command distance/speed from client field size to canonical field size.
- Server applies the command to the authoritative realtime runtime state.
- Server publishes action for the opponent.
- Server writes `match_action` with canonical replay command and `match_second`.
- New online action rows use replay action type `action`.

### 9.5 Opponent Action Poll `/api/online-match/opponent-action`

Opponent actions are fetched through HTTP polling after `turn-request` indicates it is not the local player's turn.

```json
{
  "sinceSeq": 12,
  "actions": [
    {
      "seq": 13,
      "command": {}
    }
  ]
}
```

Implementation:

- Server converts canonical command to target client's local command before returning it.
- For away target clients, server returns a local-format command that still looks like local home attacking upward.
- This is the only live-match backend push path.

### 9.6 POST `/api/online-match/clock`

Request: match/session fields only.

Response:

```json
{
  "ok": true,
  "message": "ok",
  "clock": {
    "serverTimeMillis": 0,
    "matchRemainingSeconds": 180,
    "turnRemainingSeconds": 15,
    "paused": false,
    "pauseReason": ""
  }
}
```

`clock` only returns time. It must not advance physics, return snapshots, unlock input, return score, or return winner fields.

### 9.7 POST `/api/online-match/turn-request`

Event-triggered request for local operation permission, per-turn physical caps, and skill trigger placeholders.

Implementation:

- Server owns online match clock.
- Server advances authoritative online physics, score, goal celebration pause, and match end through an independent realtime runtime loop.
- Client calls this endpoint after ready and after local movement settles.
- Response is localized so the client can treat `home` as self.
- During goal celebration, `paused=true` and both match time and turn time are fixed.

### 9.8 Player Physical Caps

Physical caps are returned by `/api/online-match/turn-request` when the server unlocks local control.

Implementation:

- Server returns localized `homePhysics` and `awayPhysics`.
- `/clock` intentionally does not carry physics data, so the 200 ms clock payload stays small.

Current important limitation:

- The client still performs local physics for responsive rendering. Online score, goal records, clock, and finish are server-owned and aligned through dedicated score, finish-check, and clock requests.

### 9.9 POST `/api/online-match/score`

Goal-triggered request for authoritative score only. The frontend calls this after a local goal event/goal animation.

### 9.10 POST `/api/online-match/finish-check`

End-triggered request for end permission and settlement data. The frontend calls this when score reaches 3 or clock reaches zero.

### 9.11 POST `/api/online-match/settlement`

Request:

```json
{
  "userId": 2,
  "requestId": "mm-xxx",
  "matchId": "online-xxx",
  "guestSessionId": "string",
  "deviceId": "string",
  "authToken": "string",
  "clientInstanceId": "string"
}
```

Implementation:

- Server returns settlement data in the same shape as single match settlement.
- Best player uses goal records and excludes own goals.
- For away users, response is localized through match record side logic.

## 10. Match Records And Replay

Base path: `/api/match-records`

Client service: `MatchRecordService.ts`

Server controller: `MatchRecordController`

Server service: `MatchRecordService`

### 10.1 POST `/api/match-records/recent`

Request:

```json
{
  "userId": 2,
  "guestSessionId": "string",
  "limit": 20
}
```

Response: recent match summaries.

Implementation:

- Reads `user_match_record`.
- Guest account is intended to show current-session records only.

### 10.2 POST `/api/match-records/replay`

Request:

```json
{
  "matchId": "string",
  "userId": 2,
  "guestSessionId": "string"
}
```

Response:

- match record summary
- home lineup
- away lineup
- action list, including `matchSecond`

Implementation:

- Reads `match_action`.
- Online replay must account for home/away user side.
- If viewer is away, server mirrors the record, lineups, commands, scores, goal sides, and actor ids before sending.
- Client replay advances its own total and turn clocks, and applies actions according to `matchSecond`.
- Goal events are not returned from `match_action`; replay physics re-detects goals locally.
- When replay reaches `end`, the client requests settlement data separately.

### 10.3 POST `/api/match-records/settlement`

Request:

```json
{
  "matchId": "string",
  "userId": 2,
  "guestSessionId": "string"
}
```

Response:

- settlement data for the replay settlement page

Implementation:

- Reads the viewer-owned finished `user_match_record`.
- Reads `match_goal_record` to build the settlement timeline.
- Mirrors online away settlement into the viewer's local home perspective.

### 10.4 POST `/api/match-records/guest-session/clear`

Clears guest-session scoped records when product requires session cleanup.

## 11. Scheduled Cleanup

Class: `MatchRecordCleanupService`

Behavior:

- Cleans records older than one week.
- Cleanup should include `user_match_record`, `match_goal_record`, and `match_action`.
- Scheduling should run at Beijing-time midnight.

## 12. Client Gameplay Implementation Notes

Current client match behavior:

- `EditableMatch` renders pitch, players, ball, HUD, goal animation, match-end animation, settlement page, and replay.
- Client still calculates local movement through `step`, `stepFixed`, collision resolution, and goal detection for display responsiveness.
- Online transport sends shoot commands only, polls opponent-action while waiting for the opponent, polls server clock for time, uses event-triggered turn-request calls for local control and physics caps, uses goal-triggered score calls for score sync, and uses finish-check for end permission and settlement data.
- Online score, goal records, finish, match clock, and turn clock are server-owned.

Required future target:

- Client should only send input commands and display server-provided action/result packets.
- Server should own final physics, score, goal detection, match clock, winner, and settlement.
- Client-local physics can remain as visual interpolation only if it cannot change authoritative results.

## 13. Commit Change Log

Each commit that changes behavior must append one entry here.

Format:

```text
YYYY-MM-DD - <branch> - <commit short hash or pending>
Scope: client/server/database/docs
Changed:
- Specific functional change.
API changes:
- Endpoint and request/response changes.
Database changes:
- Table/column/index changes.
Verification:
- Commands or manual checks.
Known risk:
- Risk or follow-up.
```

### 2026-06-20 - pending - documentation baseline

Scope: docs

Changed:

- Added this Software Design Document as the baseline record of implemented modules, API contracts, and known current limitations.
- Added explicit note that current online match is still hybrid client-prediction plus server-validation, not pure server-authoritative display.

API changes:

- None in this documentation-only entry.

Database changes:

- None in this documentation-only entry.

Verification:

- Based on current source inspection.

Known risk:

- The document is a baseline and must be updated whenever code changes.

### 2026-06-20 - implemented - time-based replay and away settlement fix

Scope: client/server

Changed:

- Away replay records are now returned as local home perspective records.
- Replay startup now sets the initial turn from the first replay shoot action instead of always forcing home.
- Replay actions now carry `matchSecond`.
- Replay playback now uses match-relative timestamps instead of fixed sequential delays.
- Replay response no longer includes settlement data.
- Replay settlement now comes from `/api/match-records/settlement` after replay reaches `end`.
- Away replay settlement mirrors goal sides and actor ids before sending.
- Online match replay persistence now records only start, action, and end rows with match-relative seconds.
- Single-match replay persistence now excludes goal and kickoff reset events from `match_action`; goals remain in `match_goal_record`.
- Abnormal online finish no longer fabricates a higher winner score; persisted score uses the actual server score.
- Online clients submit shoot commands, poll server clock for time, poll opponent actions through `/online-match/opponent-action`, fetch turn physics caps through turn-request, query score through `/online-match/score`, and query end permission through `/online-match/finish-check`.

API changes:

- No endpoint path changes.
- `/api/match-records/replay` now localizes `record.userSide` to `home` when an online away user views their replay.
- `/api/match-records/replay` action items now include `matchSecond`.
- New `/api/match-records/settlement` endpoint returns replay settlement data.

Database changes:

- `match_action.match_second` was added.

Verification:

- `mvn -q -DskipTests compile`
- `mvn test`

Known risk:

- Existing old replay records still depend on command JSON quality in `match_action`.
- Cocos Creator does not expose a standalone TypeScript build script in `client/package.json`, so client verification remains static plus runtime editor testing.
