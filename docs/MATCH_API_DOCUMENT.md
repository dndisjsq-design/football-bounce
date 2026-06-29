# Match API Document

Project: football-bounce

Document owner: engineering

Last updated: 2026-06-21

## 1. Purpose

This document records the match-only client/server message flow in actual runtime order.

The current implementation uses HTTP POST APIs for all online match messages. `clock` is only a time poll; opponent actions are fetched through `/online-match/opponent-action` only when `turn-request` says it is not the local player's turn.

## 2. Common Rules

Base URL: `/api`

All client requests are JSON POST requests through `postJson()`.

Most online-match requests include these identity/session fields:

- `userId`: current logged-in user id.
- `requestId`: online matchmaking request id.
- `matchId`: current match id.
- `deviceId`: persistent device id from local storage.
- `authToken`: login token for real accounts.
- `clientInstanceId`: one runtime instance id, used to distinguish two app instances on the same device.

The repeated identity fields are currently used because the HTTP API is stateless. Each request validates that the caller is still the same logged-in user/session. This can be optimized later with a shorter match session token.

Field size fields:

- `fieldWidth`
- `fieldHeight`

These are sent by online match requests because the backend converts commands and returned opponent actions between each client's actual field size and the canonical server field. They are not business data, but they are required by the current command scaling logic.

## 3. Shared Match DTOs

### 3.1 ShootCommand

Used by both single-player and online matches.

```json
{
  "commandId": "shoot-...",
  "matchId": "...",
  "actorId": "home-1",
  "side": "home",
  "angleRad": 1.23,
  "power": 0.85,
  "curveAngleRad": 0.12,
  "curveDistance": 120,
  "fieldWidth": 390,
  "fieldHeight": 650,
  "clientTick": 1234567890
}
```

Notes:

- `power` is already the physical command power used by the match, not the raw player ability score.
- `curveAngleRad` and `curveDistance` are physical command values.
- The frontend should not calculate raw ability-score conversion. The backend converts ability scores into physical limits.

### 3.2 MatchSnapshot

Sent when a side finishes simulating a shot and all bodies are settled.

```json
{
  "matchId": "...",
  "mode": "online",
  "fieldWidth": 390,
  "fieldHeight": 650,
  "tick": 1234,
  "turn": "away",
  "score": { "home": 1, "away": 0 },
  "players": [],
  "ball": {}
}
```

`players` contains all disk players with position, velocity, radius, mass, friction, restitution, id, kind, and side. `ball` contains the same body fields for the ball.

### 3.3 PlayerPhysicsProfile

Returned by the backend at turn boundaries.

```json
{
  "actorId": "home-1",
  "maxDragForceDistance": 149,
  "shotPowerScale": 1,
  "accuracyLineScale": 1,
  "maxCurveAngleRad": 0.8726646259971648
}
```

The client uses these values to draw the force ring and aim dots before the player begins dragging.

## 4. Single-Player Match Flow

### 4.1 Start Match

Client sends:

`POST /api/single-match/start`

```json
{
  "userId": 2,
  "clientSessionId": "guest-...",
  "fieldWidth": 390,
  "fieldHeight": 650
}
```

Server returns:

```json
{
  "ok": true,
  "message": "...",
  "matchId": "...",
  "userId": 2,
  "username": "123",
  "homeFormationId": "3-1-1",
  "awayFormationId": "3-1-1",
  "homeLineup": [],
  "awayLineup": [],
  "snapshot": {}
}
```

`homeLineup` and `awayLineup` contain player display data and each player's `physics` profile.

### 4.2 Local Player Shoots

The client first applies the shot locally for display, then sends:

`POST /api/single-match/shoot`

```json
{
  "matchId": "...",
  "command": {
    "commandId": "shoot-...",
    "matchId": "...",
    "actorId": "home-1",
    "side": "home",
    "angleRad": 1.23,
    "power": 0.85,
    "curveAngleRad": 0.12,
    "curveDistance": 120,
    "fieldWidth": 390,
    "fieldHeight": 650,
    "clientTick": 1234567890
  }
}
```

Server returns:

```json
{
  "ok": true,
  "message": "已接收用户操作",
  "expectedSnapshot": {}
}
```

The server also runs the same physics and records the accepted action.

### 4.3 Settled Snapshot Validation

After all bodies stop moving, the client sends:

`POST /api/single-match/snapshot`

```json
{
  "matchId": "...",
  "phase": "settled",
  "snapshot": {}
}
```

Server returns:

```json
{
  "ok": true,
  "valid": true,
  "message": "校验通过",
  "expectedSnapshot": {},
  "homePhysics": [],
  "awayPhysics": []
}
```

Important behavior:

- If `valid=false`, the client shows failure/forfeit behavior.
- If `valid=true`, the client immediately applies `homePhysics` and `awayPhysics`.
- The client must not allow the next local operation while this validation is pending.

### 4.4 AI Shoots

When it is the AI side's turn, the client asks the backend for the AI command:

`POST /api/single-match/ai-shoot`

Normal match request:

```json
{
  "matchId": "..."
}
```

Penalty request:

```json
{
  "matchId": "...",
  "phase": "penalty",
  "actorId": "away-3",
  "actorX": 0,
  "actorY": 100
}
```

Server returns:

```json
{
  "ok": true,
  "message": "已生成人机操作",
  "command": {},
  "expectedSnapshot": {}
}
```

The client applies the AI `command`. After all bodies settle, the client again sends `/single-match/snapshot` with `phase="settled"`.

### 4.5 AI Penalty Keeper

`POST /api/single-match/ai-keeper`

```json
{
  "matchId": "..."
}
```

Server returns:

```json
{
  "ok": true,
  "message": "已生成人机守门方向",
  "direction": 0
}
```

`direction` is `-1`, `0`, or `1`.

### 4.6 Goal Event

When a goal happens, the client sends:

`POST /api/single-match/event`

```json
{
  "matchId": "...",
  "eventId": "event-...",
  "type": "goal",
  "side": "home",
  "actorId": "home-2",
  "matchSecond": 65,
  "penalty": false,
  "ownGoal": false,
  "score": { "home": 1, "away": 0 },
  "clientTick": 1234567890
}
```

The backend records goal timeline data for settlement and replay-related views.

### 4.7 Kickoff Reset

After a goal animation and field reset, the client syncs the reset state:

`POST /api/single-match/snapshot`

```json
{
  "matchId": "...",
  "phase": "kickoff-reset",
  "snapshot": {}
}
```

Server returns `homePhysics` and `awayPhysics` again. The client applies them before the next kickoff turn can be played.

### 4.8 Finish Match

When the match ends, the client requests settlement:

`POST /api/single-match/finish`

```json
{
  "matchId": "...",
  "durationSeconds": 180,
  "score": { "home": 3, "away": 1 },
  "result": "win",
  "resultScore": "3 : 1"
}
```

Server returns:

```json
{
  "ok": true,
  "message": "...",
  "settlement": {},
  "userSummary": {}
}
```

`settlement` drives the settlement page. `userSummary` updates user info such as coins and match counters.

### 4.9 Abandon Unfinished Match

When the single-player match is left unfinished:

`POST /api/single-match/abandon`

```json
{
  "matchId": "...",
  "userId": 2
}
```

The backend removes unfinished single-player match records.

## 5. Online Match Flow

### 5.1 Join Matchmaking

Client sends:

`POST /api/online-match/join`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "guestSessionId": "...",
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns:

```json
{
  "ok": true,
  "message": "匹配中",
  "status": "WAITING",
  "requestId": "mm-..."
}
```

If already matched, the response includes match data listed in section 5.3.

### 5.2 Poll Matchmaking Status

While waiting, the client polls:

`POST /api/online-match/status`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Current client interval: about 800 ms.

Cancel request:

`POST /api/online-match/cancel`

### 5.3 Matched Response

When matching succeeds, server returns:

```json
{
  "ok": true,
  "status": "MATCHED",
  "requestId": "mm-...",
  "matchId": "...",
  "selfSide": "home",
  "initialTurn": "home",
  "leftPlayer": {},
  "rightPlayer": {},
  "homePlayer": {},
  "awayPlayer": {},
  "homeFormationId": "3-1-1",
  "awayFormationId": "3-1-1",
  "homeLineup": [],
  "awayLineup": [],
  "matchedAtMillis": 1234567890,
  "snapshot": {}
}
```

Client-side rule:

- The frontend always renders "self" as lower/red/home-local and opponent as upper/blue/away-local.
- Backend handles home/away canonical mapping and mirror conversion.

### 5.4 Start Runtime Sync

After entering the match scene, the online transport starts:

- `/online-match/clock` every 200 ms.
- `/online-match/opponent-action` every 250 ms only while waiting for the opponent's operation.
- Event-triggered `/online-match/turn-request` after ready, after local movement settles, after goal celebration, and when clock reaches zero.

### 5.5 Clock Poll

Client sends:

`POST /api/online-match/clock`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns:

```json
{
  "ok": true,
  "message": "ok",
  "clock": {
    "serverTimeMillis": 1234567890,
    "matchRemainingSeconds": 160.5,
    "turnRemainingSeconds": 11.2,
    "paused": false,
    "pauseReason": ""
  }
}
```

Current behavior:

- Identity fields are sent every time because the HTTP API is stateless.
- `/clock` only returns time data. It does not advance runtime, return snapshots, return winner fields, or unlock input.
- When `clock.paused=true` and `pauseReason="goal"`, goal celebration is in progress and both match time and turn time stay fixed.
- Player physics limits are not returned by `/clock`; they are returned by `/online-match/turn-request` when the server unlocks the local player's turn.

Possible optimization:

- After a match is established, the backend could issue a short match-session token and avoid repeating full auth fields.
- If field size is stable after scene load, the client could send it once and only resend when it changes.
- Clock remains an explicitly authorized time-only poll. Do not add score, winner, opponent action, or physics-cap fields to it.

### 5.6 Opponent Action Poll

Opponent actions are queried by the non-controlling client after `/online-match/turn-request` returns `canControl=false` with a "not your turn" message.

Client sends:

`POST /api/online-match/opponent-action`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "online-...",
  "sinceSeq": 12,
  "fieldWidth": 390,
  "fieldHeight": 650,
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns one next localized opponent action at most:

```json
{
  "ok": true,
  "message": "收到对手操作",
  "actions": [
    {
      "seq": 13,
      "actorUserId": 2,
      "actorRequestId": "mm-...",
      "actorNetworkSide": "away",
      "command": {}
    }
  ],
  "nextSeq": 13,
  "clock": {}
}
```

Important clarification:

- If the opponent has not operated yet, the server returns `ok=true`, message `等待对手操作`, an empty `actions` array, and a `nextSeq` that the client should reuse for the next poll.
- The client stops polling as soon as it receives one opponent action, obtains local control, disconnects, or the match ends.
- `/clock` remains a client-initiated time poll.
- `/turn-request` is event-triggered and returns only turn permission, physical caps, and skill trigger placeholders.

### 5.7 Local Player Shoots

Client locally applies the shot, then sends:

`POST /api/online-match/shoot`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "commandId": "shoot-...",
  "actorId": "home-1",
  "side": "home",
  "angleRad": 1.23,
  "power": 0.85,
  "curveAngleRad": 0.12,
  "curveDistance": 120,
  "fieldWidth": 390,
  "fieldHeight": 650,
  "clientTick": 1234567890,
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns:

```json
{
  "ok": true,
  "message": "操作已登记",
  "actions": [],
  "nextSeq": 13,
  "clock": {}
}
```

Server-side behavior:

- Validates session and turn.
- Converts local command to canonical field coordinates if needed.
- Validates command limits against the current server-side player physics profile.
- Applies the command to the server-authoritative realtime runtime state.
- Records and publishes the accepted action for replay and opponent polling.
- Does not wait for the opponent client to acknowledge display playback.

### 5.8 Player Physical Caps

When the server unlocks the local player's turn, `/api/online-match/turn-request` returns current localized physical caps with the permission result.

Server returns:

```json
{
  "ok": true,
  "message": "ok",
  "canControl": true,
  "homePhysics": [],
  "awayPhysics": [],
  "skillTriggers": []
}
```

### 5.9 Goal Score Sync

After a local goal event and goal animation, the frontend queries authoritative score:

`POST /api/online-match/score`

Server returns:

```json
{
  "ok": true,
  "message": "查询成功",
  "score": { "home": 1, "away": 0 }
}
```

This endpoint only returns score. It does not return turn permission, physical caps, winner, loser, or settlement data.

### 5.10 Match End Check

The backend owns match-end decisions.

The frontend calls this when score reaches 3 or clock reaches zero:

`POST /api/online-match/finish-check`

Server returns:

```json
{
  "ok": true,
  "message": "允许结束",
  "canEnd": true,
  "settlement": {}
}
```

The frontend then plays match-end animation and renders the returned settlement data.

### 5.11 Online Settlement

Client sends:

`POST /api/online-match/settlement`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "guestSessionId": "...",
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns:

```json
{
  "ok": true,
  "message": "查询成功",
  "settlement": {}
}
```

## 6. Match Records And Replay

### 6.1 Recent Records

`POST /api/match-records/recent`

Used by the home-page match record overlay.

### 6.2 Replay Data

`POST /api/match-records/replay`

Returns match summary, lineup data, and action records. The frontend replays by inserting action records into its local replay timeline.

### 6.3 Replay Settlement

`POST /api/match-records/settlement`

Used after replay ends to render the settlement overlay.

## 7. Current Transport Assessment

### 7.1 Clock Poll Payload

The current `/online-match/clock` request sends identity fields every 200 ms. It intentionally does not send field size or ask for state.

What is truly needed every clock tick:

- `matchId`
- one trusted session identifier

What is currently repeated for safety:

- `userId`
- `requestId`
- `deviceId`
- `authToken`
- `clientInstanceId`

Recommended future optimization:

- On match start, issue a short-lived `matchSessionToken`.
- Bind the token to user, request, device, client instance, match, and side.
- Send only `matchId` and `matchSessionToken`.

### 7.2 Opponent Action Poll

Current opponent-action delivery uses an HTTP poll only while the local client is waiting for the opponent:

1. Controlling client submits a local shoot command through HTTP.
2. Server validates, applies, records, and publishes the canonical command.
3. Non-controlling client polls `/online-match/opponent-action`.
4. Server returns at most one localized opponent command after `sinceSeq`.

This keeps real-time action delivery separate from time polling:

- `/clock` only returns time.
- `/turn-request` returns input permission and physical caps.
