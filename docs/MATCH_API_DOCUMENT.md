# Match API Document

Project: football-bounce

Document owner: engineering

Last updated: 2026-06-21

## 1. Purpose

This document records the match-only client/server message flow in actual runtime order.

The current implementation uses HTTP POST APIs. Online match synchronization uses normal polling for clock data and long polling for opponent actions. It is not WebSocket push yet.

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

The repeated identity fields are currently used because the HTTP API is stateless. Each request validates that the caller is still the same logged-in user/session. This can be optimized later with a shorter match session token or WebSocket session binding.

Field size fields:

- `fieldWidth`
- `fieldHeight`

These are sent by online match requests because the backend converts commands and snapshots between each client's actual field size and the canonical server field. They are not business data, but they are required by the current snapshot/command scaling logic.

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
- `/online-match/actions` as a long-poll loop.

### 5.5 Clock Poll

Client sends:

`POST /api/online-match/clock`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "fieldWidth": 390,
  "fieldHeight": 650,
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
    "turnNetworkSide": "home",
    "controlEnabled": true
  },
  "winnerNetworkSide": null,
  "loserNetworkSide": null,
  "finalScore": null
}
```

Current behavior:

- Identity fields are sent every time because the HTTP API is stateless.
- `fieldWidth` and `fieldHeight` are sent every time so backend scaling stays aligned with the current client field.
- `/clock` only returns time, turn, control state, and possible match-end fields.
- Player physics limits are not returned by `/clock`; they are returned by confirmed `/online-match/result` responses.

Possible optimization:

- After a match is established, the backend could issue a short match-session token and avoid repeating full auth fields.
- If field size is stable after scene load, the client could send it once and only resend when it changes.
- If WebSocket is introduced, clock updates can be server-pushed instead of requested every 200 ms.

### 5.6 Opponent Action Long Poll

Client sends:

`POST /api/online-match/actions`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "sinceSeq": 12,
  "fieldWidth": 390,
  "fieldHeight": 650,
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
  "actions": [
    {
      "seq": 13,
      "actorUserId": 3,
      "actorRequestId": "mm-...",
      "actorNetworkSide": "away",
      "command": {}
    }
  ],
  "nextSeq": 13,
  "clock": {},
  "winnerNetworkSide": null,
  "loserNetworkSide": null,
  "finalScore": null
}
```

Important clarification:

- Current implementation is long polling, not backend push.
- The frontend sends `/actions` and the backend can hold the request until an action appears or a timeout/deadline is reached.
- After receiving a response, the frontend immediately starts the next `/actions` request.
- The backend does not actively send data without a client request under the current HTTP implementation.

If real backend-to-client push is required, replace this with WebSocket or SSE. For action sync in a real-time game, WebSocket is the better long-term choice.

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
  "message": "操作已登记并广播，等待双方结算确认",
  "actions": [],
  "nextSeq": 13,
  "clock": {},
  "winnerNetworkSide": null,
  "loserNetworkSide": null,
  "finalScore": null
}
```

Server-side behavior:

- Validates session and turn.
- Converts local command to canonical field coordinates if needed.
- Runs server-side physics.
- Records the accepted action for replay.
- Publishes the action for the opponent's `/actions` long poll.

### 5.8 Local Result Submission Without Goal

After local simulation settles, the client sends:

`POST /api/online-match/result`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "commandId": "shoot-...",
  "snapshot": {},
  "fieldWidth": 390,
  "fieldHeight": 650,
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server returns:

```json
{
  "ok": true,
  "valid": true,
  "confirmed": true,
  "message": "双方结算已确认，下一回合已解锁",
  "clock": {},
  "winnerNetworkSide": null,
  "loserNetworkSide": null,
  "finalScore": null,
  "homePhysics": [],
  "awayPhysics": []
}
```

Meanings:

- `valid=false`: this side failed validation.
- `confirmed=false`: this side submitted, but the other side has not submitted yet. The current client retries the same result submission after a short delay if this happens.
- `confirmed=true`: both sides submitted and the next turn can unlock.
- `homePhysics` and `awayPhysics` are included on confirmed next-turn responses.

The server holds this request briefly while waiting for the other side's result, so the first submitter usually receives the final `confirmed=true` response through the same `/result` request instead of relying on `/clock`.

### 5.9 Local Result Submission With Goal

If the local simulation detects a goal, the client sends the same endpoint with event fields:

`POST /api/online-match/result`

```json
{
  "userId": 2,
  "requestId": "mm-...",
  "matchId": "...",
  "commandId": "shoot-...",
  "snapshot": null,
  "eventId": "event-...",
  "eventType": "goal",
  "eventTick": 1234,
  "eventSide": "home",
  "eventActorId": "home-2",
  "eventMatchSecond": 65,
  "eventPenalty": false,
  "eventOwnGoal": false,
  "eventScore": { "home": 1, "away": 0 },
  "fieldWidth": 390,
  "fieldHeight": 650,
  "deviceId": "fb-...",
  "authToken": "...",
  "clientInstanceId": "instance-..."
}
```

Server verifies the goal against the server-side expected result. If confirmed, the backend records the goal in the goal table and updates score/turn state.

### 5.10 Match End

The backend owns match-end decisions.

Any of these online responses may indicate match end:

- `/online-match/clock`
- `/online-match/actions`
- `/online-match/result`

End fields:

```json
{
  "winnerNetworkSide": "home",
  "loserNetworkSide": "away",
  "finalScore": { "home": 3, "away": 1 }
}
```

The frontend then plays match-end animation and requests settlement.

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

The current `/online-match/clock` request sends identity and field-size fields every 200 ms. This is heavier than strictly necessary, but it is simple and robust for stateless HTTP.

What is truly needed every clock tick:

- `matchId`
- one trusted session identifier
- optionally field size if it can change

What is currently repeated for safety:

- `userId`
- `requestId`
- `deviceId`
- `authToken`
- `clientInstanceId`
- `fieldWidth`
- `fieldHeight`

Recommended future optimization:

- On match start, issue a short-lived `matchSessionToken`.
- Bind the token to user, request, device, client instance, match, and side.
- Send only `matchId`, `matchSessionToken`, and changed field size.

### 7.2 Long Poll Versus Server Push

Current `/online-match/actions` is long polling:

1. Client sends a request with `sinceSeq`.
2. Server waits until a new action exists or timeout is reached.
3. Server returns actions.
4. Client immediately sends the next request.

This is not true server push. The backend cannot initiate a response unless the client already has an open HTTP request.

For future online gameplay, WebSocket is a better design:

- One connection per match client.
- Server pushes opponent actions, clock corrections, match-end events, and skill/physics updates.
- Client sends commands and local result reports on the same connection.
