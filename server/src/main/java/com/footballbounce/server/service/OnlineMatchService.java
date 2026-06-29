package com.footballbounce.server.service;

import com.footballbounce.server.dto.match.OnlineMatchDtos.CancelRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ActionResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.JoinRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.MatchmakingResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OnlineActionDto;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OnlineClockDto;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OnlinePlayerDto;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OnlineShootCommandDto;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OpponentActionRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ReadyRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ReadyResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ScoreRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ScoreResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SkillTriggerDto;
import com.footballbounce.server.dto.match.OnlineMatchDtos.StatusRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SubmitShootRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.TurnRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.TurnResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.BestPlayerDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.BodyDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerPhysicsSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.ScoreDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementGoalDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotDto;
import com.footballbounce.server.domain.UserLoginSession;
import com.footballbounce.server.repository.SingleMatchMapper;
import com.footballbounce.server.repository.UserLoginSessionMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OnlineMatchService {
    private static final long GUEST_USER_ID = 1L;
    private static final long WAITING_EXPIRE_MILLIS = 60_000L;
    private static final long MATCH_DURATION_MILLIS = 180_000L;
    private static final long TURN_DURATION_MILLIS = 15_000L;
    private static final long GOAL_CELEBRATION_MILLIS = 3_000L;
    private static final long READY_WAIT_MILLIS = 10_000L;
    private static final long TURN_REQUEST_SETTLE_WAIT_MILLIS = GOAL_CELEBRATION_MILLIS + 2_000L;
    private static final long SERVER_RUNTIME_TICK_MILLIS = 8L;
    private static final double SERVER_PHYSICS_STEP_SECONDS = 1.0 / 120.0;
    private static final int WIN_SCORE = 3;
    private static final double DEFAULT_FIELD_WIDTH = 362;
    private static final double DEFAULT_FIELD_HEIGHT = 650;
    private static final double PLAYER_RADIUS = 20;
    private static final double BALL_RADIUS = 13;
    private static final double PLAYER_SHOT_SPEED = 989;
    private static final double ABILITY_FULL_SCORE = 100.0;
    private static final int DEFAULT_ABILITY_SCORE = 100;
    private static final double CURVE_DEGREES_TO_RADIANS = Math.PI / 180.0;
    private static final double MAX_DRAG_FORCE_DISTANCE = 149;
    private static final double MAX_CURVE_ANGLE_AT_FULL_SCORE = 50 * CURVE_DEGREES_TO_RADIANS;
    private static final double PLAYER_MASS = 3.2;
    private static final double BALL_MASS = 0.75;
    private static final double PLAYER_FRICTION = 1.65;
    private static final double BALL_FRICTION = 1.18;
    private static final double PLAYER_STOP_SPEED = 5;
    private static final double BALL_STOP_SPEED = 7;
    private static final double PLAYER_LOW_SPEED_FRICTION_START = 170;
    private static final double BALL_LOW_SPEED_FRICTION_START = 135;
    private static final double PLAYER_TAIL_FRICTION = 5.4;
    private static final double BALL_TAIL_FRICTION = 4.2;
    private static final double PLAYER_RESTITUTION = 0.66;
    private static final double BALL_RESTITUTION = 0.94;
    private static final double GOAL_HALF_WIDTH = 63;
    private static final double GOAL_DEPTH = 30;
    private static final int SOLVER_ITERATIONS = 5;
    private static final double CURVE_MIN_DISTANCE = 34;
    private static final double CORNER_CUSHION_RADIUS = 36;
    private static final double CORNER_CUSHION_RESTITUTION = 0.92;

    private static final Map<String, List<PointRatio>> FORMATIONS = Map.of(
            "balanced-221", ratios(-0.18, -0.34, 0.18, -0.34, -0.16, -0.22, 0.16, -0.22, 0, -0.08),
            "midfield-131", ratios(0, -0.35, -0.22, -0.22, 0, -0.22, 0.22, -0.22, 0, -0.08),
            "defense-311", ratios(-0.23, -0.35, 0, -0.35, 0.23, -0.35, 0, -0.21, 0, -0.08),
            "attack-122", ratios(0, -0.35, -0.18, -0.23, 0.18, -0.23, -0.16, -0.08, 0.16, -0.08),
            "diamond-212", ratios(-0.19, -0.35, 0.19, -0.35, 0, -0.22, -0.18, -0.08, 0.18, -0.08)
    );

    private final Object lock = new Object();
    private final SingleMatchMapper mapper;
    private final UserLoginSessionMapper sessionMapper;
    private final MatchRewardService matchRewardService;
    private final Map<String, MatchmakingResponse> statuses = new ConcurrentHashMap<>();
    private final Map<String, OnlineRuntimeMatch> runtimeMatches = new ConcurrentHashMap<>();
    private final ScheduledExecutorService runtimeExecutor = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "online-match-runtime");
        thread.setDaemon(true);
        return thread;
    });
    private WaitingPlayer waitingPlayer;

    public OnlineMatchService(SingleMatchMapper mapper, UserLoginSessionMapper sessionMapper, MatchRewardService matchRewardService) {
        this.mapper = mapper;
        this.sessionMapper = sessionMapper;
        this.matchRewardService = matchRewardService;
    }

    @PostConstruct
    public void startRuntimeLoop() {
        runtimeExecutor.scheduleAtFixedRate(this::advanceOnlineRuntimeLoop, SERVER_RUNTIME_TICK_MILLIS, SERVER_RUNTIME_TICK_MILLIS, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void stopRuntimeLoop() {
        runtimeExecutor.shutdownNow();
    }

    private void advanceOnlineRuntimeLoop() {
        long now = System.currentTimeMillis();
        for (OnlineRuntimeMatch match : runtimeMatches.values()) {
            try {
                synchronized (match) {
                    boolean alreadyPersisted = match.recordPersisted;
                    match.advanceRuntime(now);
                    if (match.finished && !alreadyPersisted) {
                        persistFinishedMatch(match, now);
                    }
                }
            } catch (Exception ignored) {
                // Keep the runtime loop alive; request paths still return concrete errors.
            }
        }
    }

    @Transactional
    public MatchmakingResponse join(JoinRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = normalizeRequestId(request == null ? null : request.requestId());
        String guestSessionId = safeText(request == null ? "" : request.guestSessionId());
        String clientInstanceId = safeText(request == null ? "" : request.clientInstanceId());
        MatchmakingResponse authError = validateOfficialSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), clientInstanceId, requestId);
        if (authError != null) return authError;
        synchronized (lock) {
            MatchmakingResponse current = statuses.get(requestId);
            if (current != null && !"CANCELLED".equals(current.status())) {
                return current;
            }
            expireWaitingIfNeeded();
            if (waitingPlayer != null && waitingPlayer.userId() == userId) {
                statuses.put(waitingPlayer.requestId(), errorResponse(waitingPlayer.requestId(), "该账号已在其他窗口进入匹配，当前匹配已取消"));
                waitingPlayer = null;
            }
            WaitingPlayer player;
            try {
                player = loadWaitingPlayer(userId, requestId, guestSessionId, clientInstanceId);
            } catch (IllegalArgumentException ex) {
                return errorResponse(requestId, ex.getMessage());
            }
            if (waitingPlayer == null || waitingPlayer.requestId().equals(requestId)) {
                waitingPlayer = player;
                MatchmakingResponse waiting = waitingResponse(player, "匹配中");
                statuses.put(requestId, waiting);
                return waiting;
            }
            WaitingPlayer first = waitingPlayer;
            waitingPlayer = null;
            String matchId = "online-" + UUID.randomUUID();
            long matchedAt = System.currentTimeMillis();
            insertOnlineMatchRecords(first, player, matchId);
            OnlineRuntimeMatch runtimeMatch = createRuntimeMatch(first, player, matchId);
            MatchmakingResponse firstResponse = matchedResponse(first, player, matchId, matchedAt, runtimeMatch);
            MatchmakingResponse secondResponse = matchedResponse(player, first, matchId, matchedAt, runtimeMatch);
            statuses.put(first.requestId(), firstResponse);
            statuses.put(player.requestId(), secondResponse);
            return secondResponse;
        }
    }

    public ActionResponse submitShoot(SubmitShootRequest request) {
        if (request == null) return actionError("操作参数为空");
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return actionError("比赛不存在或已过期");
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return actionError(authError);
        if (!match.hasPlayer(userId, requestId)) return actionError("用户不属于本场比赛");
        FieldSize clientFieldSize = fieldSize(request.fieldWidth(), request.fieldHeight());
        OnlineShootCommandDto command = new OnlineShootCommandDto(
                safeText(request.commandId()).isBlank() ? UUID.randomUUID().toString() : safeText(request.commandId()),
                matchId,
                safeText(request.actorId()),
                safeText(request.side()).isBlank() ? "home" : safeText(request.side()),
                request.angleRad() == null ? 0 : request.angleRad(),
                Math.max(0, request.power() == null ? 0 : request.power()),
                request.curveAngleRad(),
                request.curveDistance(),
                request.noop() == Boolean.TRUE,
                request.clientTick() == null ? System.currentTimeMillis() : request.clientTick()
        );
        synchronized (match) {
            long now = System.currentTimeMillis();
            match.advanceRuntime(now);
            String networkSide = match.networkSide(userId, requestId);
            match.updateFieldSize(requestId, clientFieldSize);
            if (match.finished) {
                persistFinishedMatch(match, now);
                return new ActionResponse(false, "比赛已结束", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            if (!match.started) {
                return new ActionResponse(false, "比赛尚未开始", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            if (!networkSide.equals(match.turnNetworkSide)) {
                return new ActionResponse(false, "还没有轮到当前玩家", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            if (!match.controlEnabled()) {
                return new ActionResponse(false, "当前回合尚未解锁", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            if (match.publishedByCommandId.containsKey(command.commandId())) {
                return new ActionResponse(true, "操作已登记", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            OnlineShootCommandDto serverCommand = canonicalCommand(command, networkSide, matchId, clientFieldSize);
            String commandError = match.serverState.commandLimitError(serverCommand);
            if (!commandError.isBlank()) {
                return new ActionResponse(false, commandError, List.of(), match.lastPublishedSeq, match.clock(now));
            }
            if (!match.serverState.applyCommand(serverCommand)) {
                return new ActionResponse(false, "服务端拒绝本次操作", List.of(), match.lastPublishedSeq, match.clock(now));
            }
            OnlineActionState action = new OnlineActionState(userId, requestId, networkSide, serverCommand, now);
            action.seq = ++match.lastPublishedSeq;
            match.publishedActions.add(action);
            match.publishedByCommandId.put(command.commandId(), action);
            match.latestAction = action;
            match.turnNetworkSide = match.serverState.turn;
            match.turnElapsedMillis = 0;
            match.physicsStepAccumulatorSeconds = 0;
            mapper.insertAction(matchId, match.nextActionIndex(), userId, networkSide, serverCommand.actorId(), "action", match.matchSecond(now), commandJson(serverCommand), null, "pending");
            match.notifyAll();
            return new ActionResponse(true, "操作已登记", List.of(), match.lastPublishedSeq, match.clock(now));
        }
    }

    public ActionResponse pollOpponentAction(OpponentActionRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request == null ? "" : request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return actionError("比赛不存在或已过期");
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return actionError(authError);
        if (!match.hasPlayer(userId, requestId)) return actionError("用户不属于本场比赛");
        FieldSize clientFieldSize = fieldSize(request == null ? null : request.fieldWidth(), request == null ? null : request.fieldHeight());
        synchronized (match) {
            long now = System.currentTimeMillis();
            match.advanceRuntime(now);
            String networkSide = match.networkSide(userId, requestId);
            match.updateFieldSize(requestId, clientFieldSize);
            long sinceSeq = Math.max(0, request == null || request.sinceSeq() == null ? 0 : request.sinceSeq());
            List<OnlineActionDto> actions = match.publishedActions
                    .stream()
                    .filter(action -> action.seq > sinceSeq)
                    .filter(action -> !networkSide.equals(action.actorNetworkSide))
                    .map(action -> new OnlineActionDto(
                            action.seq,
                            action.actorUserId,
                            action.actorRequestId,
                            action.actorNetworkSide,
                            localCommand(action.command, networkSide, match.fieldSizeForRequestId(requestId))
                    ))
                    .limit(1)
                    .toList();
            long nextSeq = actions.isEmpty()
                    ? Math.max(sinceSeq, match.lastPublishedSeq)
                    : actions.get(actions.size() - 1).seq();
            String message = actions.isEmpty() ? "等待对手操作" : "收到对手操作";
            return new ActionResponse(true, message, actions, nextSeq, match.clock(now));
        }
    }

    private void recordOnlineGoal(OnlineRuntimeMatch match, OnlineActionState action, String goalSide) {
        if (match == null || action == null) return;
        String actorId = safeText(action.command.actorId());
        String actorSide = sideForActor(actorId, action.command.side());
        boolean ownGoal = !actorSide.equals(goalSide);
        int matchSecond = match.matchSecond(action.createdAtMillis);
        long scorerUserId = match.userIdForSide(actorSide);
        String scorerUsername = match.usernameForSide(actorSide);
        String playerId = match.playerIdForActor(actorId);
        String playerName = match.playerNameForId(actorSide, playerId);
        mapper.insertGoal(match.matchId, match.nextGoalOrder(), matchSecond, scorerUserId, scorerUsername, goalSide, actorId, playerId, playerName, false, ownGoal);
    }

    public ClockResponse clock(ClockRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request == null ? "" : request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return new ClockResponse(false, "比赛不存在或已过期", null);
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return new ClockResponse(false, authError, null);
        if (!match.hasPlayer(userId, requestId)) return new ClockResponse(false, "用户不属于本场比赛", null);
        synchronized (match) {
            long now = System.currentTimeMillis();
            return new ClockResponse(true, "ok", match.clock(now));
        }
    }

    public ReadyResponse ready(ReadyRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request == null ? "" : request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return new ReadyResponse(false, "比赛不存在或已过期", false, null, null);
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return new ReadyResponse(false, authError, false, null, null);
        if (!match.hasPlayer(userId, requestId)) return new ReadyResponse(false, "用户不属于本场比赛", false, null, null);
        FieldSize clientFieldSize = fieldSize(request == null ? null : request.fieldWidth(), request == null ? null : request.fieldHeight());
        synchronized (match) {
            long now = System.currentTimeMillis();
            String networkSide = match.networkSide(userId, requestId);
            match.updateFieldSize(requestId, clientFieldSize);
            match.markReady(requestId, now);
            long deadline = now + READY_WAIT_MILLIS;
            while (!match.started && !match.finished) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) break;
                try {
                    match.wait(remaining);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            now = System.currentTimeMillis();
            if (match.finished) {
                persistFinishedMatch(match, now);
                return new ReadyResponse(false, match.finishMessage, false, match.clock(now), match.localSnapshot(networkSide));
            }
            if (!match.started) {
                return new ReadyResponse(true, "等待对手场景加载", false, match.clock(now), match.localSnapshot(networkSide));
            }
            return new ReadyResponse(true, "比赛已开始", true, match.clock(now), match.localSnapshot(networkSide));
        }
    }

    public TurnResponse turnRequest(TurnRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request == null ? "" : request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return turnError("比赛不存在或已过期");
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return turnError(authError);
        if (!match.hasPlayer(userId, requestId)) return turnError("用户不属于本场比赛");
        FieldSize clientFieldSize = fieldSize(request == null ? null : request.fieldWidth(), request == null ? null : request.fieldHeight());
        synchronized (match) {
            long now = System.currentTimeMillis();
            match.advanceRuntime(now);
            String networkSide = match.networkSide(userId, requestId);
            match.updateFieldSize(requestId, clientFieldSize);
            if (match.finished) {
                persistFinishedMatch(match, now);
                return new TurnResponse(false, "比赛已结束", false, match.clock(now), List.of(), List.of(), List.of());
            }
            if (!match.started) {
                return new TurnResponse(true, "等待双方开始比赛", false, match.clock(now), List.of(), List.of(), List.of());
            }
            if (!networkSide.equals(match.turnNetworkSide)) {
                return new TurnResponse(true, "不是你的回合", false, match.clock(now), List.of(), List.of(), List.of());
            }
            if (!match.controlEnabled()) {
                long deadline = now + TURN_REQUEST_SETTLE_WAIT_MILLIS;
                while (!match.finished && match.started && networkSide.equals(match.turnNetworkSide) && !match.controlEnabled()) {
                    long remaining = deadline - System.currentTimeMillis();
                    if (remaining <= 0) break;
                    try {
                        match.wait(remaining);
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
                now = System.currentTimeMillis();
                match.advanceRuntime(now);
                if (match.finished) {
                    persistFinishedMatch(match, now);
                    return new TurnResponse(false, "比赛已结束", false, match.clock(now), List.of(), List.of(), List.of());
                }
                if (!networkSide.equals(match.turnNetworkSide)) {
                    return new TurnResponse(true, "不是你的回合", false, match.clock(now), List.of(), List.of(), List.of());
                }
                if (!match.controlEnabled()) {
                    return new TurnResponse(true, "等待场上静止", false, match.clock(now), List.of(), List.of(), List.of());
                }
            }
            return new TurnResponse(
                    true,
                    "允许操作",
                    true,
                    match.clock(now),
                    match.localPhysics("home", networkSide),
                    match.localPhysics("away", networkSide),
                    List.<SkillTriggerDto>of()
            );
        }
    }

    public ScoreResponse score(ScoreRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = safeText(request == null ? "" : request.requestId());
        String matchId = safeText(request == null ? "" : request.matchId());
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return new ScoreResponse(false, "比赛不存在或已过期", null);
        String authError = validateActionSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId());
        if (authError != null) return new ScoreResponse(false, authError, null);
        if (!match.hasPlayer(userId, requestId)) return new ScoreResponse(false, "用户不属于本场比赛", null);
        synchronized (match) {
            long now = System.currentTimeMillis();
            match.advanceRuntime(now);
            String networkSide = match.networkSide(userId, requestId);
            if (match.finished) persistFinishedMatch(match, now);
            return new ScoreResponse(true, "查询成功", match.localCurrentScore(networkSide));
        }
    }

    public FinishCheckResponse finishCheck(FinishCheckRequest request) {
        if (request == null) return finishCheckError("结束校验参数为空");
        long userId = normalizeUserId(request.userId());
        String requestId = safeText(request.requestId());
        String matchId = safeText(request.matchId());
        if (matchId.isBlank()) return finishCheckError("比赛编号为空");
        String authError = validateActionSession(userId, request.deviceId(), request.authToken(), request.clientInstanceId());
        if (authError != null) return finishCheckError(authError);
        OnlineRuntimeMatch match = runtimeMatches.get(matchId);
        if (match == null) return finishCheckError("比赛不存在或已过期");
        synchronized (match) {
            if (!match.hasPlayer(userId, requestId)) {
                return finishCheckError("用户不属于本场比赛");
            }
            long now = System.currentTimeMillis();
            match.advanceRuntime(now);
            if (!match.finished) {
                return new FinishCheckResponse(true, "比赛尚未结束", false, null);
            }
            persistFinishedMatch(match, now);
        }
        SettlementResponse settlement = buildOnlineSettlement(userId, matchId, safeText(request.guestSessionId()));
        if (!settlement.ok() || settlement.settlement() == null) {
            return finishCheckError(settlement.message());
        }
        return new FinishCheckResponse(true, "允许结束", true, settlement.settlement());
    }

    public SettlementResponse settlement(SettlementRequest request) {
        if (request == null) return settlementError("结算参数为空");
        long userId = normalizeUserId(request.userId());
        String requestId = safeText(request.requestId());
        String matchId = safeText(request.matchId());
        if (matchId.isBlank()) return settlementError("比赛编号为空");
        String authError = validateActionSession(userId, request.deviceId(), request.authToken(), request.clientInstanceId());
        if (authError != null) return settlementError(authError);
        OnlineRuntimeMatch runtimeMatch = runtimeMatches.get(matchId);
        if (runtimeMatch != null) {
            synchronized (runtimeMatch) {
                if (!runtimeMatch.hasPlayer(userId, requestId)) {
                    return settlementError("用户不属于本场比赛");
                }
                if (runtimeMatch.finished) {
                    persistFinishedMatch(runtimeMatch, System.currentTimeMillis());
                }
            }
        }
        return buildOnlineSettlement(userId, matchId, safeText(request.guestSessionId()));
    }

    private SettlementResponse buildOnlineSettlement(long userId, String matchId, String guestSessionId) {
        boolean guestOnly = userId == GUEST_USER_ID;
        if (guestOnly && guestSessionId.isBlank()) {
            return settlementError("游客会话已失效");
        }
        Map<String, Object> record = mapper.findOnlineFinishedRecord(matchId, userId, guestOnly, guestSessionId);
        if (record == null) {
            return settlementError("未查询到已完成的多人比赛记录");
        }
        String userSide = "away".equals(stringValue(record.get("userSide"))) ? "away" : "home";
        String result = stringValue(record.get("result"));
        String scoreText = stringValue(record.get("resultScore"));
        List<SettlementGoalDto> goals = mapper.findGoalsByMatchNo(matchId)
                .stream()
                .map(row -> settlementGoal(row, userSide))
                .filter(goal -> !goal.penalty())
                .sorted(Comparator.comparingInt(SettlementGoalDto::matchSecond)
                        .thenComparingInt(SettlementGoalDto::order))
                .toList();
        String winnerSide = localWinnerSide(result, scoreText);
        BestPlayerDto best = bestPlayer(winnerSide, goals, record, userSide);
        SettlementDto settlement = new SettlementDto(matchId, result, scoreText, winnerSide, best, goals);
        return new SettlementResponse(true, "查询成功", settlement);
    }

    public MatchmakingResponse status(StatusRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = normalizeRequestId(request == null ? null : request.requestId());
        MatchmakingResponse authError = validateOfficialSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId(), requestId);
        if (authError != null) return authError;
        synchronized (lock) {
            expireWaitingIfNeeded();
            MatchmakingResponse current = statuses.get(requestId);
            if (current != null) {
                return current;
            }
            return emptyResponse(requestId, "IDLE", "未进入匹配队列");
        }
    }

    public MatchmakingResponse cancel(CancelRequest request) {
        long userId = normalizeUserId(request == null ? null : request.userId());
        String requestId = normalizeRequestId(request == null ? null : request.requestId());
        MatchmakingResponse authError = validateOfficialSession(userId, request == null ? "" : request.deviceId(), request == null ? "" : request.authToken(), request == null ? "" : request.clientInstanceId(), requestId);
        if (authError != null) return authError;
        synchronized (lock) {
            if (waitingPlayer != null && waitingPlayer.requestId().equals(requestId)) {
                waitingPlayer = null;
            }
            MatchmakingResponse cancelled = emptyResponse(requestId, "CANCELLED", "已取消匹配");
            statuses.put(requestId, cancelled);
            return cancelled;
        }
    }

    private void persistFinishedMatch(OnlineRuntimeMatch match, long now) {
        if (match == null || !match.finished || match.recordPersisted) return;
        match.recordPersisted = true;
        ScoreDto score = match.serverState.score();
        int duration = (int) Math.max(0, Math.min(MATCH_DURATION_MILLIS, match.matchElapsedMillis) / 1000);
        boolean homeWin = "home".equals(match.winnerNetworkSide);
        boolean awayWin = "away".equals(match.winnerNetworkSide);
        mapper.finishMatch(match.matchId, match.homeUserId, duration, score.home() + " : " + score.away(), homeWin ? "win" : "lose");
        mapper.finishMatch(match.matchId, match.awayUserId, duration, score.away() + " : " + score.home(), awayWin ? "win" : "lose");
        matchRewardService.recordOnlineMatchResult(match.homeUserId, match.matchId, homeWin);
        matchRewardService.recordOnlineMatchResult(match.awayUserId, match.matchId, awayWin);
        mapper.insertAction(
                match.matchId,
                match.nextActionIndex(),
                0L,
                "server",
                null,
                "end",
                duration,
                finishJson(match.matchId, match.winnerNetworkSide, score),
                true,
                match.finishMessage == null || match.finishMessage.isBlank() ? "match finished" : match.finishMessage
        );
    }

    private static ScoreDto finishScoreOrNull(OnlineRuntimeMatch match) {
        return match == null || !match.finished ? null : match.serverState.score();
    }

    private static ScoreDto localScore(ScoreDto score, String targetNetworkSide) {
        if (score == null) return null;
        return "away".equals(targetNetworkSide) ? new ScoreDto(score.away(), score.home()) : score;
    }

    private void insertOnlineMatchRecords(
            WaitingPlayer first,
            WaitingPlayer second,
            String matchId
    ) {
        WaitingPlayer home = homePlayer(first, second);
        WaitingPlayer away = home == first ? second : first;
        String homeIds = String.join(",", home.playerIds());
        String awayIds = String.join(",", away.playerIds());
        mapper.insertMatchRecord(matchId, home.userId(), home.username(), "home", home.clientSessionId(), "online", away.userId(), away.username(), home.formationId(), away.formationId(), homeIds, awayIds);
        mapper.insertMatchRecord(matchId, away.userId(), away.username(), "away", away.clientSessionId(), "online", home.userId(), home.username(), home.formationId(), away.formationId(), homeIds, awayIds);
        mapper.insertAction(matchId, 0, 0L, "server", null, "start", 0, startJson(matchId), true, "match started");
    }

    private OnlineRuntimeMatch createRuntimeMatch(WaitingPlayer first, WaitingPlayer second, String matchId) {
        WaitingPlayer home = homePlayer(first, second);
        WaitingPlayer away = home == first ? second : first;
        OnlineRuntimeMatch runtimeMatch = new OnlineRuntimeMatch(
                matchId,
                home.userId(),
                home.requestId(),
                home.username(),
                home.formationId(),
                home.lineup(),
                away.userId(),
                away.requestId(),
                away.username(),
                away.formationId(),
                away.lineup(),
                System.currentTimeMillis()
        );
        runtimeMatches.put(matchId, runtimeMatch);
        return runtimeMatch;
    }

    private MatchmakingResponse matchedResponse(WaitingPlayer self, WaitingPlayer other, String matchId, long matchedAt, OnlineRuntimeMatch runtimeMatch) {
        WaitingPlayer first = self.joinedAtMillis() <= other.joinedAtMillis() ? self : other;
        WaitingPlayer second = first == self ? other : self;
        WaitingPlayer home = homePlayer(first, second);
        WaitingPlayer away = home == first ? second : first;
        String selfSide = self == home ? "home" : "away";
        boolean selfIsAway = "away".equals(selfSide);
        SnapshotDto snapshot = runtimeMatch == null ? null : runtimeMatch.localSnapshot(selfSide);
        return new MatchmakingResponse(
                true,
                "匹配成功",
                "MATCHED",
                self.requestId(),
                matchId,
                selfSide,
                selfIsAway ? "away" : "home",
                playerDto(first),
                playerDto(second),
                playerDto(self),
                playerDto(other),
                selfIsAway ? away.formationId() : home.formationId(),
                selfIsAway ? home.formationId() : away.formationId(),
                selfIsAway ? away.lineup() : home.lineup(),
                selfIsAway ? home.lineup() : away.lineup(),
                matchedAt,
                snapshot
        );
    }

    private MatchmakingResponse waitingResponse(WaitingPlayer player, String message) {
        return new MatchmakingResponse(
                true,
                message,
                "WAITING",
                player.requestId(),
                null,
                null,
                null,
                playerDto(player),
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(),
                0,
                null
        );
    }

    private MatchmakingResponse emptyResponse(String requestId, String status, String message) {
        return new MatchmakingResponse(
                true,
                message,
                status,
                requestId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(),
                0,
                null
        );
    }

    private MatchmakingResponse errorResponse(String requestId, String message) {
        return new MatchmakingResponse(
                false,
                message,
                "ERROR",
                requestId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(),
                0,
                null
        );
    }

    private MatchmakingResponse validateOfficialSession(long userId, String deviceIdValue, String authTokenValue, String clientInstanceIdValue, String requestId) {
        if (userId == GUEST_USER_ID) return null;
        String deviceId = safeText(deviceIdValue);
        String authToken = safeText(authTokenValue);
        String clientInstanceId = safeText(clientInstanceIdValue);
        if (deviceId.isBlank() || authToken.isBlank() || clientInstanceId.isBlank()) {
            return errorResponse(requestId, "请重新登录后再进入真人联机");
        }
        UserLoginSession session = sessionMapper.findActiveForInstance(deviceId, sha256Hex(authToken), clientInstanceId);
        if (session == null || !Long.valueOf(userId).equals(session.getUserId())) {
            return errorResponse(requestId, "该账号已在其他设备登录，请重新登录");
        }
        sessionMapper.touch(session.getId());
        return null;
    }

    private String validateActionSession(long userId, String deviceIdValue, String authTokenValue, String clientInstanceIdValue) {
        if (userId == GUEST_USER_ID) return null;
        String deviceId = safeText(deviceIdValue);
        String authToken = safeText(authTokenValue);
        String clientInstanceId = safeText(clientInstanceIdValue);
        if (deviceId.isBlank() || authToken.isBlank() || clientInstanceId.isBlank()) {
            return "请重新登录后再进入真人联机";
        }
        UserLoginSession session = sessionMapper.findActiveForInstance(deviceId, sha256Hex(authToken), clientInstanceId);
        if (session == null || !Long.valueOf(userId).equals(session.getUserId())) {
            return "该账号已在其他设备登录，请重新登录";
        }
        sessionMapper.touch(session.getId());
        return null;
    }

    private ActionResponse actionError(String message) {
        return new ActionResponse(false, message, List.of(), 0, null);
    }

    private TurnResponse turnError(String message) {
        return new TurnResponse(false, message, false, null, List.of(), List.of(), List.of());
    }

    private FinishCheckResponse finishCheckError(String message) {
        return new FinishCheckResponse(false, message, false, null);
    }

    private SettlementResponse settlementError(String message) {
        return new SettlementResponse(false, message, null);
    }

    private SettlementGoalDto settlementGoal(Map<String, Object> row, String targetNetworkSide) {
        String canonicalSide = "away".equals(stringValue(row.get("side"))) ? "away" : "home";
        String actorId = stringValue(row.get("actorId"));
        boolean mirror = "away".equals(targetNetworkSide);
        return new SettlementGoalDto(
                intValue(row.get("matchSecond")),
                boolValue(row.get("penalty")),
                longValue(row.get("userId")),
                stringValue(row.get("username")),
                localSide(canonicalSide, targetNetworkSide),
                mirror ? swapPlayerId(actorId) : actorId,
                stringValue(row.get("playerId")),
                stringValue(row.get("playerName")),
                boolValue(row.get("ownGoal")),
                intValue(row.get("goalOrder"))
        );
    }

    private static String localWinnerSide(String result, String scoreText) {
        String safeResult = safeTextStatic(result);
        if ("win".equals(safeResult)) return "home";
        if ("lose".equals(safeResult)) return "away";
        int[] score = parseScoreText(scoreText);
        if (score[0] > score[1]) return "home";
        if (score[1] > score[0]) return "away";
        return "draw";
    }

    private static int[] parseScoreText(String scoreText) {
        String[] parts = safeTextStatic(scoreText).replace('：', ':').split(":");
        if (parts.length < 2) return new int[] {0, 0};
        return new int[] {leadingInt(parts[0]), leadingInt(parts[1])};
    }

    private static int leadingInt(String text) {
        String value = safeTextStatic(text);
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < value.length(); i += 1) {
            char c = value.charAt(i);
            if (Character.isDigit(c)) {
                digits.append(c);
            } else if (digits.length() > 0) {
                break;
            }
        }
        if (digits.length() == 0) return 0;
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private BestPlayerDto bestPlayer(String winnerSide, List<SettlementGoalDto> goals, Map<String, Object> record, String userSide) {
        if (!"home".equals(winnerSide) && !"away".equals(winnerSide)) {
            return null;
        }
        Map<String, SettlementPlayerGoalCount> counts = new HashMap<>();
        for (SettlementGoalDto goal : goals) {
            if (goal.ownGoal() || !winnerSide.equals(goal.side())) {
                continue;
            }
            String key = safeTextStatic(goal.playerId()).isBlank() ? safeTextStatic(goal.actorId()) : safeTextStatic(goal.playerId());
            SettlementPlayerGoalCount current = counts.computeIfAbsent(key, ignored -> new SettlementPlayerGoalCount(goal));
            current.goals += 1;
            current.firstOrder = Math.min(current.firstOrder, goal.order());
        }
        return counts.values()
                .stream()
                .sorted(Comparator.comparingInt(SettlementPlayerGoalCount::goals).reversed()
                        .thenComparingInt(SettlementPlayerGoalCount::firstOrder))
                .map(SettlementPlayerGoalCount::toDto)
                .findFirst()
                .orElseGet(() -> fallbackBestPlayer(winnerSide, record, userSide));
    }

    private BestPlayerDto fallbackBestPlayer(String winnerSide, Map<String, Object> record, String userSide) {
        String canonicalWinnerSide = canonicalSide(winnerSide, userSide);
        String idsText = "away".equals(canonicalWinnerSide)
                ? stringValue(record.get("awayLineupPlayerIds"))
                : stringValue(record.get("homeLineupPlayerIds"));
        List<PlayerSummary> lineup = loadLineupPlayers(splitIds(idsText));
        if (lineup.isEmpty()) {
            return null;
        }
        int bestSlot = 0;
        PlayerSummary best = lineup.get(0);
        for (int i = 1; i < lineup.size(); i += 1) {
            PlayerSummary player = lineup.get(i);
            int rank = rarityRank(player.rarity());
            int bestRank = rarityRank(best.rarity());
            if (rank < bestRank) {
                best = player;
                bestSlot = i;
            }
        }
        long fallbackUserId = "home".equals(winnerSide)
                ? longValue(record.get("userId"))
                : longValue(record.get("opponentUserId"));
        String fallbackUsername = "home".equals(winnerSide)
                ? stringValue(record.get("username"))
                : stringValue(record.get("opponentUsername"));
        return new BestPlayerDto(fallbackUserId, fallbackUsername, winnerSide, winnerSide + "-" + (bestSlot + 1), best.id(), best.name(), 0);
    }

    private static List<String> splitIds(String idsText) {
        if (idsText == null || idsText.isBlank()) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        for (String part : idsText.split(",")) {
            String id = part.trim();
            if (!id.isBlank()) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static int rarityRank(String rarity) {
        return switch (safeTextStatic(rarity)) {
            case "red" -> 0;
            case "orange" -> 1;
            case "purple" -> 2;
            default -> 3;
        };
    }

    private static FieldSize fieldSize(Double width, Double height) {
        return new FieldSize(positiveOrDefault(width, DEFAULT_FIELD_WIDTH), positiveOrDefault(height, DEFAULT_FIELD_HEIGHT));
    }

    private static FieldSize canonicalFieldSize() {
        return new FieldSize(DEFAULT_FIELD_WIDTH, DEFAULT_FIELD_HEIGHT);
    }

    private static double positiveOrDefault(Double value, double fallback) {
        return value == null || !Double.isFinite(value) || value <= 0 ? fallback : value;
    }

    private static SnapshotDto scaleSnapshotToField(SnapshotDto snapshot, FieldSize source, FieldSize target) {
        if (snapshot == null) return null;
        List<BodyDto> scaledPlayers = snapshot.players() == null
                ? List.of()
                : snapshot.players().stream().map(body -> scaleBodyToField(body, source, target)).toList();
        return new SnapshotDto(
                snapshot.matchId(),
                snapshot.mode(),
                target.width(),
                target.height(),
                snapshot.tick(),
                snapshot.turn(),
                snapshot.score(),
                scaledPlayers,
                scaleBodyToField(snapshot.ball(), source, target)
        );
    }

    private static BodyDto scaleBodyToField(BodyDto body, FieldSize source, FieldSize target) {
        if (body == null) return null;
        double sx = target.width() / source.width();
        double sy = target.height() / source.height();
        return new BodyDto(
                body.id(),
                body.kind(),
                body.side(),
                body.x() * sx,
                body.y() * sy,
                body.vx() * sx,
                body.vy() * sy,
                body.radius(),
                body.mass(),
                body.friction(),
                body.restitution()
        );
    }

    private static double distanceScaleForAngle(double angleRad, FieldSize source, FieldSize target) {
        double sx = target.width() / source.width();
        double sy = target.height() / source.height();
        return Math.hypot(Math.cos(angleRad) * sx, Math.sin(angleRad) * sy);
    }

    private static double angleBetweenFields(double angleRad, FieldSize source, FieldSize target, boolean rotateHalfTurn) {
        double sx = target.width() / source.width();
        double sy = target.height() / source.height();
        double x = Math.cos(angleRad) * sx;
        double y = Math.sin(angleRad) * sy;
        if (rotateHalfTurn) {
            x = -x;
            y = -y;
        }
        return normalizeAngle(Math.atan2(y, x));
    }

    private static SnapshotDto canonicalSnapshot(SnapshotDto snapshot, String localNetworkSide) {
        if (snapshot == null) return null;
        SnapshotDto normalized = scaleSnapshotToField(snapshot, fieldSize(snapshot.fieldWidth(), snapshot.fieldHeight()), canonicalFieldSize());
        return "away".equals(localNetworkSide) ? mirrorSnapshot(normalized) : normalized;
    }

    private static String canonicalSide(String localSide, String localNetworkSide) {
        String value = "away".equals(localSide) ? "away" : "home";
        return "away".equals(localNetworkSide) ? swapSide(value) : value;
    }

    private static String canonicalActorId(String localActorId, String localNetworkSide) {
        String value = safeTextStatic(localActorId);
        return "away".equals(localNetworkSide) ? swapPlayerId(value) : value;
    }

    private static OnlineShootCommandDto canonicalCommand(OnlineShootCommandDto command, String networkSide, String matchId, FieldSize sourceFieldSize) {
        if (command.noop() == Boolean.TRUE) {
            return new OnlineShootCommandDto(
                    command.commandId(),
                    matchId,
                    "",
                    "away".equals(networkSide) ? "away" : "home",
                    0,
                    0,
                    0.0,
                    0.0,
                    true,
                    command.clientTick()
            );
        }
        double localAngle = normalizeAngle(command.angleRad());
        double canonicalAngle = angleBetweenFields(localAngle, sourceFieldSize, canonicalFieldSize(), "away".equals(networkSide));
        double distanceScale = distanceScaleForAngle(localAngle, sourceFieldSize, canonicalFieldSize());
        double canonicalPower = Math.max(0, command.power()) * distanceScale;
        Double canonicalCurveDistance = command.curveDistance() == null ? null : Math.max(0, command.curveDistance()) * distanceScale;
        if (!"away".equals(networkSide)) {
            return new OnlineShootCommandDto(
                    command.commandId(),
                    matchId,
                    command.actorId(),
                    "home",
                    canonicalAngle,
                    canonicalPower,
                    command.curveAngleRad(),
                    canonicalCurveDistance,
                    command.noop(),
                    command.clientTick()
            );
        }
        return new OnlineShootCommandDto(
                command.commandId(),
                matchId,
                swapPlayerId(command.actorId()),
                "away",
                canonicalAngle,
                canonicalPower,
                command.curveAngleRad(),
                canonicalCurveDistance,
                command.noop(),
                command.clientTick()
        );
    }

    private static OnlineShootCommandDto localCommand(OnlineShootCommandDto canonical, String targetNetworkSide, FieldSize targetFieldSize) {
        if (canonical == null) return null;
        if (canonical.noop() == Boolean.TRUE) {
            return new OnlineShootCommandDto(
                    canonical.commandId(),
                    canonical.matchId(),
                    "",
                    localSide(canonical.side(), targetNetworkSide),
                    0,
                    0,
                    0.0,
                    0.0,
                    true,
                    canonical.clientTick()
            );
        }
        double orientedCanonicalAngle = "away".equals(targetNetworkSide)
                ? rotateHalfTurnAngle(canonical.angleRad())
                : normalizeAngle(canonical.angleRad());
        double localAngle = angleBetweenFields(orientedCanonicalAngle, canonicalFieldSize(), targetFieldSize, false);
        double distanceScale = distanceScaleForAngle(localAngle, targetFieldSize, canonicalFieldSize());
        double localPower = distanceScale <= 0 ? canonical.power() : canonical.power() / distanceScale;
        Double localCurveDistance = canonical.curveDistance() == null || distanceScale <= 0
                ? canonical.curveDistance()
                : canonical.curveDistance() / distanceScale;
        if (!"away".equals(targetNetworkSide)) {
            return new OnlineShootCommandDto(
                    canonical.commandId(),
                    canonical.matchId(),
                    canonical.actorId(),
                    canonical.side(),
                    localAngle,
                    localPower,
                    canonical.curveAngleRad(),
                    localCurveDistance,
                    canonical.noop(),
                    canonical.clientTick()
            );
        }
        return new OnlineShootCommandDto(
                canonical.commandId(),
                canonical.matchId(),
                swapPlayerId(canonical.actorId()),
                swapSide(canonical.side()),
                localAngle,
                localPower,
                canonical.curveAngleRad(),
                localCurveDistance,
                canonical.noop(),
                canonical.clientTick()
        );
    }

    private static double rotateHalfTurnAngle(double angleRad) {
        return normalizeAngle(angleRad + Math.PI);
    }

    private static SnapshotDto mirrorSnapshot(SnapshotDto snapshot) {
        ScoreDto score = snapshot.score() == null
                ? new ScoreDto(0, 0)
                : new ScoreDto(snapshot.score().away(), snapshot.score().home());
        List<BodyDto> mirroredPlayers = snapshot.players() == null
                ? List.of()
                : snapshot.players().stream().map(OnlineMatchService::mirrorPlayerBody).toList();
        return new SnapshotDto(
                snapshot.matchId(),
                snapshot.mode(),
                snapshot.fieldWidth(),
                snapshot.fieldHeight(),
                snapshot.tick(),
                swapSide(snapshot.turn()),
                score,
                mirroredPlayers,
                mirrorBallBody(snapshot.ball())
        );
    }

    private static BodyDto mirrorPlayerBody(BodyDto body) {
        if (body == null) return null;
        String side = swapSide(body.side());
        return new BodyDto(
                swapPlayerId(body.id()),
                body.kind(),
                side,
                -body.x(),
                -body.y(),
                -body.vx(),
                -body.vy(),
                body.radius(),
                body.mass(),
                body.friction(),
                body.restitution()
        );
    }

    private static BodyDto mirrorBallBody(BodyDto body) {
        if (body == null) return null;
        return new BodyDto(
                body.id(),
                body.kind(),
                body.side(),
                -body.x(),
                -body.y(),
                -body.vx(),
                -body.vy(),
                body.radius(),
                body.mass(),
                body.friction(),
                body.restitution()
        );
    }

    private static String swapSide(String side) {
        return "away".equals(side) ? "home" : "away";
    }

    private static String localSide(String canonicalSide, String targetNetworkSide) {
        String value = "away".equals(canonicalSide) ? "away" : "home";
        return "away".equals(targetNetworkSide) ? swapSide(value) : value;
    }

    private static String swapPlayerId(String id) {
        String value = id == null ? "" : id.trim();
        if (value.startsWith("home-")) return "away-" + value.substring("home-".length());
        if (value.startsWith("away-")) return "home-" + value.substring("away-".length());
        return value;
    }

    private static double normalizeAngle(double angle) {
        double value = angle;
        while (value > Math.PI) value -= Math.PI * 2;
        while (value < -Math.PI) value += Math.PI * 2;
        return value;
    }

    private static String commandJson(OnlineShootCommandDto command) {
        if (command == null) return "{}";
        return "{"
                + "\"commandId\":\"" + jsonEscape(command.commandId()) + "\","
                + "\"matchId\":\"" + jsonEscape(command.matchId()) + "\","
                + "\"actorId\":\"" + jsonEscape(command.actorId()) + "\","
                + "\"side\":\"" + jsonEscape(command.side()) + "\","
                + "\"angleRad\":" + command.angleRad() + ","
                + "\"power\":" + command.power() + ","
                + "\"curveAngleRad\":" + (command.curveAngleRad() == null ? 0 : command.curveAngleRad()) + ","
                + "\"curveDistance\":" + (command.curveDistance() == null ? 0 : command.curveDistance()) + ","
                + "\"noop\":" + (command.noop() == Boolean.TRUE) + ","
                + "\"clientTick\":" + command.clientTick()
                + "}";
    }

    private static String finishJson(String matchId, String winnerSide, ScoreDto score) {
        ScoreDto safeScore = score == null ? new ScoreDto(0, 0) : score;
        return "{"
                + "\"matchId\":\"" + jsonEscape(matchId) + "\","
                + "\"type\":\"finish\","
                + "\"side\":\"" + jsonEscape(winnerSide) + "\","
                + "\"score\":{\"home\":" + safeScore.home() + ",\"away\":" + safeScore.away() + "}"
                + "}";
    }

    private static String startJson(String matchId) {
        return "{\"matchId\":\"" + jsonEscape(matchId) + "\",\"type\":\"start\"}";
    }

    private static String jsonEscape(String value) {
        if (value == null) return "";
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private static String safeTextStatic(String value) {
        return value == null ? "" : value.trim();
    }

    private static String sideForActor(String actorId, String fallbackSide) {
        String value = safeTextStatic(actorId);
        if (value.startsWith("home-")) return "home";
        if (value.startsWith("away-")) return "away";
        return "away".equals(fallbackSide) ? "away" : "home";
    }

    private static int slotIndex(String actorId) {
        String value = safeTextStatic(actorId);
        int dash = value.indexOf('-');
        if (dash < 0 || dash + 1 >= value.length()) return -1;
        try {
            return Integer.parseInt(value.substring(dash + 1)) - 1;
        } catch (Exception ignored) {
            return -1;
        }
    }

    private WaitingPlayer loadWaitingPlayer(long userId, String requestId, String guestSessionId, String clientInstanceId) {
        Map<String, Object> user = mapper.findUser(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        Map<String, Object> lineup = mapper.findUserLineup(userId);
        if (lineup == null) {
            throw new IllegalArgumentException("请先设置阵容");
        }
        String formationId = stringValue(lineup.get("selectedFormationId"));
        List<String> playerIds = List.of(
                stringValue(lineup.get("slot1PlayerId")),
                stringValue(lineup.get("slot2PlayerId")),
                stringValue(lineup.get("slot3PlayerId")),
                stringValue(lineup.get("slot4PlayerId")),
                stringValue(lineup.get("slot5PlayerId"))
        );
        List<PlayerSummary> players = loadLineupPlayers(playerIds);
        return new WaitingPlayer(
                userId,
                requestId,
                userId == GUEST_USER_ID ? guestSessionId : "",
                clientInstanceId,
                stringValue(user.get("username")),
                stringValue(user.get("displayName")),
                stringValue(user.get("avatarUrl")),
                formationId,
                playerIds,
                players,
                System.currentTimeMillis()
        );
    }

    private List<PlayerSummary> loadLineupPlayers(List<String> playerIds) {
        List<Map<String, Object>> rows = mapper.findPlayersByIds(playerIds);
        Map<String, PlayerSummary> byId = new HashMap<>();
        for (Map<String, Object> row : rows) {
            PlayerSummary player = new PlayerSummary(
                    stringValue(row.get("id")),
                    stringValue(row.get("name")),
                    intValue(row.get("score")),
                    stringValue(row.get("rarity")),
                    intValue(row.get("avatarSeed")),
                    physicsFromRow(row)
            );
            byId.put(player.id(), player);
        }
        List<PlayerSummary> ordered = new ArrayList<>();
        for (String id : playerIds) {
            PlayerSummary player = byId.get(id);
            if (player != null) ordered.add(player);
        }
        return ordered;
    }

    private void expireWaitingIfNeeded() {
        if (waitingPlayer == null) return;
        if (System.currentTimeMillis() - waitingPlayer.joinedAtMillis() <= WAITING_EXPIRE_MILLIS) return;
        statuses.put(waitingPlayer.requestId(), emptyResponse(waitingPlayer.requestId(), "EXPIRED", "匹配已超时"));
        waitingPlayer = null;
    }

    private WaitingPlayer homePlayer(WaitingPlayer first, WaitingPlayer second) {
        if (first.userId() < second.userId()) return first;
        if (second.userId() < first.userId()) return second;
        return first;
    }

    private OnlinePlayerDto playerDto(WaitingPlayer player) {
        if (player == null) return null;
        return new OnlinePlayerDto(player.userId(), player.username(), player.displayName(), player.avatarUrl());
    }

    private long normalizeUserId(Long userId) {
        return userId == null || userId <= 0 ? GUEST_USER_ID : userId;
    }

    private String normalizeRequestId(String requestId) {
        String value = safeText(requestId);
        return value.isBlank() ? UUID.randomUUID().toString() : value;
    }

    private String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private int intValue(Object value) {
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static int abilityScore(Object value) {
        if (value == null) {
            return DEFAULT_ABILITY_SCORE;
        }
        int score;
        if (value instanceof Number number) {
            score = number.intValue();
        } else {
            String text = String.valueOf(value).trim();
            if (text.isEmpty()) {
                return DEFAULT_ABILITY_SCORE;
            }
            try {
                score = Integer.parseInt(text);
            } catch (NumberFormatException ignored) {
                return DEFAULT_ABILITY_SCORE;
            }
        }
        return Math.max(0, score);
    }

    private static double abilityMultiplier(Object value) {
        int score = abilityScore(value);
        if (score <= ABILITY_FULL_SCORE) {
            return score / ABILITY_FULL_SCORE;
        }
        double extra = score - ABILITY_FULL_SCORE;
        return 1 + 0.035 * extra + 0.006 * extra * extra;
    }

    private static PlayerPhysicsSummary physicsFromRow(Map<String, Object> row) {
        return physicsWithActorId(
                "",
                abilityMultiplier(row.get("power")),
                abilityMultiplier(row.get("accuracy")),
                abilityMultiplier(row.get("curve"))
        );
    }

    private static PlayerPhysicsSummary physicsWithActorId(String actorId, PlayerPhysicsSummary physics) {
        if (physics == null) {
            return physicsWithActorId(actorId, 1, 1, 1);
        }
        return new PlayerPhysicsSummary(
                actorId,
                physics.maxDragForceDistance(),
                physics.shotPowerScale(),
                physics.accuracyLineScale(),
                physics.maxCurveAngleRad()
        );
    }

    private static PlayerPhysicsSummary physicsWithActorId(String actorId, double powerMultiplier, double accuracyMultiplier, double curveMultiplier) {
        return new PlayerPhysicsSummary(
                actorId,
                MAX_DRAG_FORCE_DISTANCE * powerMultiplier,
                powerMultiplier,
                accuracyMultiplier,
                MAX_CURVE_ANGLE_AT_FULL_SCORE * curveMultiplier
        );
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static boolean boolValue(Object value) {
        if (value instanceof Boolean bool) return bool;
        if (value instanceof Number number) return number.intValue() != 0;
        String text = value == null ? "" : String.valueOf(value).trim();
        return "1".equals(text) || Boolean.parseBoolean(text);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private record WaitingPlayer(
            Long userId,
            String requestId,
            String clientSessionId,
            String clientInstanceId,
            String username,
            String displayName,
            String avatarUrl,
            String formationId,
            List<String> playerIds,
            List<PlayerSummary> lineup,
            long joinedAtMillis
    ) {
    }

    private static final class Body {
        private final String id;
        private final String kind;
        private final String side;
        private double x;
        private double y;
        private double vx;
        private double vy;
        private final double radius;
        private final double mass;
        private final double friction;
        private final double restitution;

        private Body(String id, String kind, String side, double x, double y, double radius, double mass, double friction, double restitution) {
            this.id = id;
            this.kind = kind;
            this.side = side;
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.mass = mass;
            this.friction = friction;
            this.restitution = restitution;
        }

        private BodyDto dto() {
            return new BodyDto(id, kind, side, round(x), round(y), round(vx), round(vy), radius, mass, friction, restitution);
        }
    }

    private static final class OnlineServerState {
        private final String matchId;
        private final String homeFormationId;
        private final String awayFormationId;
        private final List<PlayerSummary> homeLineup;
        private final List<PlayerSummary> awayLineup;
        private final double fieldWidth;
        private final double fieldHeight;
        private final List<Body> players = new ArrayList<>();
        private final Map<String, CurveMotion> activeCurves = new HashMap<>();
        private Body ball;
        private String turn = "home";
        private int scoreHome = 0;
        private int scoreAway = 0;
        private long tick = 0;
        private boolean goalLocked = false;

        private OnlineServerState(String matchId, String homeFormationId, String awayFormationId, List<PlayerSummary> homeLineup, List<PlayerSummary> awayLineup, double fieldWidth, double fieldHeight) {
            this.matchId = matchId == null ? "" : matchId;
            this.homeFormationId = homeFormationId;
            this.awayFormationId = awayFormationId;
            this.homeLineup = homeLineup == null ? List.of() : List.copyOf(homeLineup);
            this.awayLineup = awayLineup == null ? List.of() : List.copyOf(awayLineup);
            this.fieldWidth = fieldWidth;
            this.fieldHeight = fieldHeight;
        }

        private void resetObjects(String startingTurn) {
            players.clear();
            activeCurves.clear();
            turn = startingTurn;
            goalLocked = false;
            ball = makeBall(0, 0);
            List<PointRatio> homeFormation = FORMATIONS.getOrDefault(homeFormationId, FORMATIONS.get("balanced-221"));
            List<PointRatio> awayFormation = FORMATIONS.getOrDefault(awayFormationId, FORMATIONS.get("balanced-221"));
            for (int i = 0; i < 5; i += 1) {
                PointRatio point = homeFormation.get(Math.min(i, homeFormation.size() - 1));
                players.add(makePlayer("home-" + (i + 1), "home", point.x * fieldWidth, point.y * fieldHeight));
            }
            for (int i = 0; i < 5; i += 1) {
                PointRatio point = awayFormation.get(Math.min(i, awayFormation.size() - 1));
                players.add(makePlayer("away-" + (i + 1), "away", -point.x * fieldWidth, point.y * fieldHeight * -1));
            }
            resolveAllCollisions();
        }

        private PlayerSummary playerForActor(String actorId) {
            int slot = slotIndex(actorId);
            if (slot < 0) return null;
            List<PlayerSummary> lineup = actorId != null && actorId.startsWith("away-") ? awayLineup : homeLineup;
            return slot >= lineup.size() ? null : lineup.get(slot);
        }

        private double powerScaleForActor(String actorId) {
            PlayerSummary player = playerForActor(actorId);
            return player == null || player.physics() == null ? 1 : player.physics().shotPowerScale();
        }

        private double maxCurveAngleForActor(String actorId) {
            PlayerSummary player = playerForActor(actorId);
            return player == null || player.physics() == null ? MAX_CURVE_ANGLE_AT_FULL_SCORE : player.physics().maxCurveAngleRad();
        }

        private boolean applyCommand(OnlineShootCommandDto command) {
            if (command.noop() == Boolean.TRUE) {
                if (!command.side().equals(turn) || !isSettled()) {
                    return false;
                }
                turn = "home".equals(turn) ? "away" : "home";
                goalLocked = false;
                return true;
            }
            Body actor = findBody(command.actorId());
            if (actor == null || !actor.side.equals(command.side()) || !command.side().equals(turn) || !isSettled()) {
                return false;
            }
            double maxCurveAngle = maxCurveAngleForActor(actor.id);
            double curveAngle = clamp(command.curveAngleRad() == null ? 0 : command.curveAngleRad(), -maxCurveAngle, maxCurveAngle);
            double curveDistance = Math.max(0, command.curveDistance() == null ? 0 : command.curveDistance());
            boolean hasCurve = Math.abs(curveAngle) > 0.03 && curveDistance > CURVE_MIN_DISTANCE;
            double shotAngle = command.angleRad() + (hasCurve ? curveAngle : 0);
            double speed = PLAYER_SHOT_SPEED * clamp(command.power(), 0, powerScaleForActor(actor.id));
            actor.vx = Math.cos(shotAngle) * speed;
            actor.vy = Math.sin(shotAngle) * speed;
            activeCurves.clear();
            if (hasCurve) {
                activeCurves.put(actor.id, new CurveMotion(-curveAngle * 2, curveDistance));
            }
            turn = "home".equals(turn) ? "away" : "home";
            goalLocked = false;
            return true;
        }

        private String commandLimitError(OnlineShootCommandDto command) {
            if (command == null) return "操作为空";
            if (command.noop() == Boolean.TRUE) {
                if (!command.side().equals(turn)) return "当前不是该方回合";
                if (!isSettled()) return "场上物体尚未完全停止";
                return "";
            }
            Body actor = findBody(command.actorId());
            if (actor == null) return "操作球员不存在";
            if (!actor.side.equals(command.side())) return "操作球员归属错误";
            if (!command.side().equals(turn)) return "当前不是该方回合";
            if (!isSettled()) return "场上物体尚未完全停止";
            double maxPower = powerScaleForActor(actor.id);
            if (command.power() < -0.001 || command.power() > maxPower + 0.001) {
                return "力度超过球员上限";
            }
            double maxCurveAngle = maxCurveAngleForActor(actor.id);
            double curveAngle = command.curveAngleRad() == null ? 0 : command.curveAngleRad();
            if (Math.abs(curveAngle) > maxCurveAngle + 0.001) {
                return "弧度超过球员上限";
            }
            if (command.curveDistance() != null && command.curveDistance() < -0.001) {
                return "弧线距离无效";
            }
            if (!Double.isFinite(command.angleRad()) || !Double.isFinite(command.power())) {
                return "操作参数非法";
            }
            return "";
        }

        private void step(double dt) {
            for (Body body : bodies()) {
                integrateBody(body, dt);
            }
            resolveAllCollisions();
            checkGoal();
        }

        private void integrateBody(Body body, double dt) {
            double speedBeforeDamping = speed(body);
            applyCurveMotion(body, dt, speedBeforeDamping);
            body.x += body.vx * dt;
            body.y += body.vy * dt;
            double damping = Math.exp(-effectiveFriction(body, speedBeforeDamping) * dt);
            body.vx *= damping;
            body.vy *= damping;
            double stopSpeed = "ball".equals(body.kind) ? BALL_STOP_SPEED : PLAYER_STOP_SPEED;
            if (speed(body) < stopSpeed) {
                body.vx = 0;
                body.vy = 0;
                activeCurves.remove(body.id);
            }
        }

        private void applyCurveMotion(Body body, double dt, double speed) {
            if (!"player".equals(body.kind) || speed <= 0) return;
            CurveMotion curve = activeCurves.get(body.id);
            if (curve == null) return;
            double travel = Math.min(speed * dt, curve.remainingDistance);
            if (travel <= 0) {
                activeCurves.remove(body.id);
                return;
            }
            double angleStep = curve.remainingAngle * (travel / curve.remainingDistance);
            double cos = Math.cos(angleStep);
            double sin = Math.sin(angleStep);
            double vx = body.vx;
            double vy = body.vy;
            body.vx = vx * cos - vy * sin;
            body.vy = vx * sin + vy * cos;
            curve.remainingAngle -= angleStep;
            curve.remainingDistance -= travel;
            if (Math.abs(curve.remainingAngle) < 0.01 || curve.remainingDistance <= 1) {
                activeCurves.remove(body.id);
            }
        }

        private double effectiveFriction(Body body, double speed) {
            double lowSpeed = "ball".equals(body.kind) ? BALL_LOW_SPEED_FRICTION_START : PLAYER_LOW_SPEED_FRICTION_START;
            if (speed >= lowSpeed) return body.friction;
            double tailFriction = "ball".equals(body.kind) ? BALL_TAIL_FRICTION : PLAYER_TAIL_FRICTION;
            double slowFactor = 1 - speed / lowSpeed;
            return body.friction + tailFriction * slowFactor * slowFactor;
        }

        private void resolveAllCollisions() {
            List<Body> bodies = bodies();
            for (int iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
                for (Body body : bodies) {
                    collideArena(body);
                }
                for (int i = 0; i < bodies.size(); i += 1) {
                    for (int j = i + 1; j < bodies.size(); j += 1) {
                        collideBodies(bodies.get(i), bodies.get(j));
                    }
                }
            }
        }

        private void collideArena(Body body) {
            double left = -fieldWidth / 2 + body.radius;
            double right = fieldWidth / 2 - body.radius;
            boolean collided = false;
            if (body.x < left) {
                body.x = left;
                body.vx = Math.abs(body.vx) * wallRestitution(body);
                collided = true;
            }
            if (body.x > right) {
                body.x = right;
                body.vx = -Math.abs(body.vx) * wallRestitution(body);
                collided = true;
            }

            double goalLineY = goalLineY();
            double topLimit = bodyInsideGoalMouth(body) ? fieldHeight / 2 - body.radius : goalLineY - body.radius;
            double bottomLimit = bodyInsideGoalMouth(body) ? -fieldHeight / 2 + body.radius : -goalLineY + body.radius;
            if (body.y > topLimit) {
                body.y = topLimit;
                body.vy = -Math.abs(body.vy) * wallRestitution(body);
                collided = true;
            }
            if (body.y < bottomLimit) {
                body.y = bottomLimit;
                body.vy = Math.abs(body.vy) * wallRestitution(body);
                collided = true;
            }
            if (collideCornerCushions(body)) collided = true;
            if (collided) activeCurves.remove(body.id);
            if ("ball".equals(body.kind)) {
                collideGoalPost(body, -GOAL_HALF_WIDTH, goalLineY);
                collideGoalPost(body, GOAL_HALF_WIDTH, goalLineY);
                collideGoalPost(body, -GOAL_HALF_WIDTH, -goalLineY);
                collideGoalPost(body, GOAL_HALF_WIDTH, -goalLineY);
            }
        }

        private void collideGoalPost(Body body, double x, double y) {
            double postRadius = 5;
            double dx = body.x - x;
            double dy = body.y - y;
            double min = body.radius + postRadius;
            double dSq = dx * dx + dy * dy;
            if (dSq >= min * min) return;
            double d = Math.sqrt(dSq);
            if (d < 0.0001) d = 0.0001;
            double nx = dx / d;
            double ny = dy / d;
            body.x += nx * (min - d);
            body.y += ny * (min - d);
            double vn = body.vx * nx + body.vy * ny;
            if (vn < 0) {
                double bounce = 1 + wallRestitution(body);
                body.vx -= bounce * vn * nx;
                body.vy -= bounce * vn * ny;
            }
        }

        private boolean collideCornerCushions(Body body) {
            boolean collided = false;
            double halfW = fieldWidth / 2;
            double top = goalLineY();
            double bottom = -goalLineY();
            double[][] corners = {
                    {-halfW, top, -1, 1},
                    {halfW, top, 1, 1},
                    {-halfW, bottom, -1, -1},
                    {halfW, bottom, 1, -1}
            };
            for (double[] corner : corners) {
                double dx = body.x - corner[0];
                double dy = body.y - corner[1];
                if (dx * corner[2] > 0 || dy * corner[3] > 0) continue;
                double min = CORNER_CUSHION_RADIUS + body.radius;
                double dSq = dx * dx + dy * dy;
                if (dSq >= min * min) continue;
                double d = Math.sqrt(dSq);
                if (d < 0.0001) d = 0.0001;
                double nx = dx / d;
                double ny = dy / d;
                body.x += nx * (min - d);
                body.y += ny * (min - d);
                double vn = body.vx * nx + body.vy * ny;
                if (vn < 0) {
                    double bounce = 1 + CORNER_CUSHION_RESTITUTION;
                    body.vx -= bounce * vn * nx;
                    body.vy -= bounce * vn * ny;
                }
                collided = true;
            }
            return collided;
        }

        private void collideBodies(Body a, Body b) {
            double dx = b.x - a.x;
            double dy = b.y - a.y;
            double d = Math.sqrt(dx * dx + dy * dy);
            double min = a.radius + b.radius;
            if (d >= min) return;
            if (d < 0.0001) {
                d = 0.0001;
                dx = 1;
                dy = 0;
            }
            double nx = dx / d;
            double ny = dy / d;
            double invA = 1 / a.mass;
            double invB = 1 / b.mass;
            double invTotal = invA + invB;
            double correction = (min - d) / invTotal;
            a.x -= nx * correction * invA;
            a.y -= ny * correction * invA;
            b.x += nx * correction * invB;
            b.y += ny * correction * invB;
            activeCurves.remove(a.id);
            activeCurves.remove(b.id);

            double relVx = b.vx - a.vx;
            double relVy = b.vy - a.vy;
            double relNormalSpeed = relVx * nx + relVy * ny;
            if (relNormalSpeed > 0) return;
            double restitution = collisionRestitution(a, b);
            double impulse = (-(1 + restitution) * relNormalSpeed) / invTotal;
            a.vx -= impulse * invA * nx;
            a.vy -= impulse * invA * ny;
            b.vx += impulse * invB * nx;
            b.vy += impulse * invB * ny;
        }

        private void checkGoal() {
            if (goalLocked || Math.abs(ball.x) > GOAL_HALF_WIDTH - ball.radius) return;
            if (ball.y > goalLineY() + ball.radius) {
                scoreHome += 1;
                stopBallInGoal();
                goalLocked = true;
            } else if (ball.y < -goalLineY() - ball.radius) {
                scoreAway += 1;
                stopBallInGoal();
                goalLocked = true;
            }
        }

        private void stopBallInGoal() {
            ball.vx = 0;
            ball.vy = 0;
            activeCurves.remove(ball.id);
        }

        private SnapshotDto snapshot() {
            List<BodyDto> playerDtos = players.stream().map(Body::dto).toList();
            return new SnapshotDto(matchId, "online", fieldWidth, fieldHeight, tick, turn, new ScoreDto(scoreHome, scoreAway), playerDtos, ball.dto());
        }

        private ScoreDto score() {
            return new ScoreDto(scoreHome, scoreAway);
        }

        private boolean isSettled() {
            for (Body body : bodies()) {
                if (Math.abs(body.vx) + Math.abs(body.vy) >= 1) return false;
            }
            return true;
        }

        private Body findBody(String id) {
            for (Body body : players) {
                if (body.id.equals(id)) return body;
            }
            if (ball.id.equals(id)) return ball;
            return null;
        }

        private List<Body> bodies() {
            List<Body> result = new ArrayList<>(players);
            result.add(ball);
            return result;
        }

        private double goalLineY() {
            return fieldHeight / 2 - GOAL_DEPTH;
        }

        private boolean bodyInsideGoalMouth(Body body) {
            return Math.abs(body.x) <= GOAL_HALF_WIDTH - body.radius;
        }

        private double wallRestitution(Body body) {
            return "ball".equals(body.kind) ? 0.86 : 0.58;
        }

        private double collisionRestitution(Body a, Body b) {
            if ("player".equals(a.kind) && "player".equals(b.kind)) return 0.98;
            if (!a.kind.equals(b.kind)) return 0.88;
            return Math.min(a.restitution, b.restitution);
        }

        private static Body makePlayer(String id, String side, double x, double y) {
            return new Body(id, "player", side, x, y, PLAYER_RADIUS, PLAYER_MASS, PLAYER_FRICTION, PLAYER_RESTITUTION);
        }

        private static Body makeBall(double x, double y) {
            return new Body("ball", "ball", null, x, y, BALL_RADIUS, BALL_MASS, BALL_FRICTION, BALL_RESTITUTION);
        }

        private static double speed(Body body) {
            return Math.sqrt(body.vx * body.vx + body.vy * body.vy);
        }
    }

    private static final class CurveMotion {
        private double remainingAngle;
        private double remainingDistance;

        private CurveMotion(double remainingAngle, double remainingDistance) {
            this.remainingAngle = remainingAngle;
            this.remainingDistance = remainingDistance;
        }
    }

    private record PointRatio(double x, double y) {
    }

    private record FieldSize(double width, double height) {
    }

    private final class OnlineRuntimeMatch {
        private final String matchId;
        private final Long homeUserId;
        private final String homeRequestId;
        private final String homeUsername;
        private final String homeFormationId;
        private final List<PlayerSummary> homeLineup;
        private final Long awayUserId;
        private final String awayRequestId;
        private final String awayUsername;
        private final String awayFormationId;
        private final List<PlayerSummary> awayLineup;
        private final long startedAtMillis;
        private final OnlineServerState serverState;
        private final Map<String, OnlineActionState> publishedByCommandId = new HashMap<>();
        private final Map<String, FieldSize> fieldSizesByRequestId = new HashMap<>();
        private final Set<String> readyRequestIds = new HashSet<>();
        private final List<OnlineActionState> publishedActions = new ArrayList<>();
        private long lastPublishedSeq = 0;
        private int nextActionIndex = 1;
        private int nextGoalOrder = 1;
        private String turnNetworkSide = "home";
        private long lastAdvancedAtMillis;
        private long matchElapsedMillis;
        private long turnElapsedMillis;
        private long celebrationUntilMillis;
        private double physicsStepAccumulatorSeconds;
        private String pauseReason = "";
        private boolean started;
        private int recordedScoreHome;
        private int recordedScoreAway;
        private String pendingWinnerAfterCelebration;
        private boolean finished;
        private String winnerNetworkSide;
        private String loserNetworkSide;
        private String finishMessage;
        private boolean recordPersisted;
        private OnlineActionState latestAction;

        private OnlineRuntimeMatch(
                String matchId,
                Long homeUserId,
                String homeRequestId,
                String homeUsername,
                String homeFormationId,
                List<PlayerSummary> homeLineup,
                Long awayUserId,
                String awayRequestId,
                String awayUsername,
                String awayFormationId,
                List<PlayerSummary> awayLineup,
                long startedAtMillis
        ) {
            this.matchId = matchId;
            this.homeUserId = homeUserId;
            this.homeRequestId = homeRequestId;
            this.homeUsername = homeUsername == null || homeUsername.isBlank() ? "home" : homeUsername;
            this.homeFormationId = homeFormationId == null || homeFormationId.isBlank() ? "balanced-221" : homeFormationId;
            this.homeLineup = homeLineup == null ? List.of() : List.copyOf(homeLineup);
            this.awayUserId = awayUserId;
            this.awayRequestId = awayRequestId;
            this.awayUsername = awayUsername == null || awayUsername.isBlank() ? "away" : awayUsername;
            this.awayFormationId = awayFormationId == null || awayFormationId.isBlank() ? "balanced-221" : awayFormationId;
            this.awayLineup = awayLineup == null ? List.of() : List.copyOf(awayLineup);
            this.startedAtMillis = startedAtMillis;
            this.lastAdvancedAtMillis = startedAtMillis;
            this.serverState = new OnlineServerState(matchId, this.homeFormationId, this.awayFormationId, this.homeLineup, this.awayLineup, DEFAULT_FIELD_WIDTH, DEFAULT_FIELD_HEIGHT);
            this.serverState.resetObjects("home");
            this.fieldSizesByRequestId.put(homeRequestId, canonicalFieldSize());
            this.fieldSizesByRequestId.put(awayRequestId, canonicalFieldSize());
        }

        private boolean hasPlayer(long userId, String requestId) {
            return (Long.valueOf(userId).equals(homeUserId) && homeRequestId.equals(requestId))
                    || (Long.valueOf(userId).equals(awayUserId) && awayRequestId.equals(requestId));
        }

        private String networkSide(long userId, String requestId) {
            return Long.valueOf(userId).equals(homeUserId) && homeRequestId.equals(requestId) ? "home" : "away";
        }

        private String opponentSide(String side) {
            return "home".equals(side) ? "away" : "home";
        }

        private void updateFieldSize(String requestId, FieldSize size) {
            String key = safeTextStatic(requestId);
            if (key.isBlank() || size == null) return;
            fieldSizesByRequestId.put(key, size);
        }

        private String requestIdForSide(String side) {
            return "away".equals(side) ? awayRequestId : homeRequestId;
        }

        private void markReady(String requestId, long now) {
            String key = safeTextStatic(requestId);
            if (!key.isBlank()) readyRequestIds.add(key);
            if (!started && readyRequestIds.contains(homeRequestId) && readyRequestIds.contains(awayRequestId)) {
                started = true;
                lastAdvancedAtMillis = now;
                pauseReason = "";
                notifyAll();
            }
        }

        private FieldSize fieldSizeForRequestId(String requestId) {
            return fieldSizesByRequestId.getOrDefault(safeTextStatic(requestId), canonicalFieldSize());
        }

        private void advanceRuntime(long now) {
            if (finished) {
                lastAdvancedAtMillis = now;
                return;
            }
            if (!started) {
                lastAdvancedAtMillis = now;
                return;
            }
            if (now <= lastAdvancedAtMillis) return;
            long remaining = now - lastAdvancedAtMillis;
            long cursor = lastAdvancedAtMillis;
            while (remaining > 0 && !finished) {
                long slice = Math.min(SERVER_RUNTIME_TICK_MILLIS, remaining);
                long next = cursor + slice;
                if (celebrationUntilMillis > cursor) {
                    long pausedSlice = Math.min(slice, celebrationUntilMillis - cursor);
                    cursor += pausedSlice;
                    remaining -= pausedSlice;
                    pauseReason = "goal";
                    if (cursor >= celebrationUntilMillis) {
                        finishGoalCelebration(cursor);
                    }
                    continue;
                }
                pauseReason = "";
                boolean settledBeforeSlice = serverState.isSettled();
                boolean goalStarted = false;
                if (settledBeforeSlice) {
                    physicsStepAccumulatorSeconds = 0;
                } else {
                    physicsStepAccumulatorSeconds += slice / 1000.0;
                    while (physicsStepAccumulatorSeconds + 1e-9 >= SERVER_PHYSICS_STEP_SECONDS) {
                        boolean settledBeforeStep = serverState.isSettled();
                        serverState.step(SERVER_PHYSICS_STEP_SECONDS);
                        serverState.tick += 1;
                        physicsStepAccumulatorSeconds = Math.max(0, physicsStepAccumulatorSeconds - SERVER_PHYSICS_STEP_SECONDS);
                        ScoreDto score = serverState.score();
                        if (score.home() >= WIN_SCORE) {
                            startGoalCelebration(cursor, "home");
                            pendingWinnerAfterCelebration = "home";
                            goalStarted = true;
                            break;
                        }
                        if (score.away() >= WIN_SCORE) {
                            startGoalCelebration(cursor, "away");
                            pendingWinnerAfterCelebration = "away";
                            goalStarted = true;
                            break;
                        }
                        ScoreDto lastRecordedScore = lastRecordedScore();
                        if (score.home() > lastRecordedScore.home() || score.away() > lastRecordedScore.away()) {
                            String side = score.home() > lastRecordedScore.home() ? "home" : "away";
                            startGoalCelebration(cursor, side);
                            goalStarted = true;
                            break;
                        }
                        if (!settledBeforeStep && serverState.isSettled()) {
                            physicsStepAccumulatorSeconds = 0;
                            notifyAll();
                            break;
                        }
                    }
                }
                if (goalStarted) break;
                matchElapsedMillis += slice;
                if (settledBeforeSlice && serverState.isSettled()) {
                    turnElapsedMillis = Math.min(TURN_DURATION_MILLIS, turnElapsedMillis + slice);
                }
                if (matchElapsedMillis >= MATCH_DURATION_MILLIS) {
                    finishByTime();
                    break;
                }
                cursor = next;
                remaining -= slice;
            }
            lastAdvancedAtMillis = now;
        }

        private OnlineClockDto clock(long now) {
            boolean paused = celebrationUntilMillis > now;
            double matchRemaining = Math.max(0, (MATCH_DURATION_MILLIS - matchElapsedMillis) / 1000.0);
            double turnRemaining = Math.max(0, (TURN_DURATION_MILLIS - turnElapsedMillis) / 1000.0);
            String reason = !started ? "waiting" : paused ? "goal" : pauseReason;
            return new OnlineClockDto(now, matchRemaining, turnRemaining, paused || !started, reason);
        }

        private int matchSecond(long now) {
            return (int) Math.max(0, Math.min(MATCH_DURATION_MILLIS, matchElapsedMillis) / 1000);
        }

        private ScoreDto lastRecordedScore() {
            return new ScoreDto(recordedScoreHome, recordedScoreAway);
        }

        private boolean controlEnabled() {
            return started && !finished && celebrationUntilMillis <= System.currentTimeMillis() && serverState.isSettled();
        }

        private void startGoalCelebration(long now, String goalSide) {
            if (celebrationUntilMillis > now) return;
            OnlineMatchService.this.recordOnlineGoal(this, latestAction, goalSide);
            ScoreDto score = serverState.score();
            recordedScoreHome = score.home();
            recordedScoreAway = score.away();
            turnNetworkSide = opponentSide(goalSide);
            serverState.turn = turnNetworkSide;
            turnElapsedMillis = 0;
            celebrationUntilMillis = now + GOAL_CELEBRATION_MILLIS;
            pauseReason = "goal";
            notifyAll();
        }

        private void finishGoalCelebration(long now) {
            if (pendingWinnerAfterCelebration != null && !pendingWinnerAfterCelebration.isBlank()) {
                finishWithWinner(pendingWinnerAfterCelebration, "比赛结束");
                pendingWinnerAfterCelebration = null;
            } else if (!finished) {
                serverState.resetObjects(turnNetworkSide);
                physicsStepAccumulatorSeconds = 0;
                turnElapsedMillis = 0;
            }
            pauseReason = "";
            celebrationUntilMillis = 0;
            lastAdvancedAtMillis = now;
            notifyAll();
        }

        private void finishByTime() {
            ScoreDto score = serverState.score();
            if (score.home() > score.away()) {
                finishWithWinner("home", "比赛结束");
            } else if (score.away() > score.home()) {
                finishWithWinner("away", "比赛结束");
            }
        }

        private SnapshotDto localSnapshot(String targetNetworkSide) {
            SnapshotDto canonical = serverState.snapshot();
            return "away".equals(targetNetworkSide) ? OnlineMatchService.mirrorSnapshot(canonical) : canonical;
        }

        private String localTurnSide(String targetNetworkSide) {
            return localSide(turnNetworkSide, targetNetworkSide);
        }

        private String localWinnerSide(String targetNetworkSide) {
            return winnerNetworkSide == null ? null : localSide(winnerNetworkSide, targetNetworkSide);
        }

        private String localLoserSide(String targetNetworkSide) {
            return loserNetworkSide == null ? null : localSide(loserNetworkSide, targetNetworkSide);
        }

        private ScoreDto localFinishScore(String targetNetworkSide) {
            return OnlineMatchService.localScore(OnlineMatchService.finishScoreOrNull(this), targetNetworkSide);
        }

        private ScoreDto localCurrentScore(String targetNetworkSide) {
            return OnlineMatchService.localScore(serverState.score(), targetNetworkSide);
        }

        private int nextActionIndex() {
            int value = nextActionIndex;
            nextActionIndex += 1;
            return value;
        }

        private int nextGoalOrder() {
            int value = nextGoalOrder;
            nextGoalOrder += 1;
            return value;
        }

        private long userIdForSide(String side) {
            return "away".equals(side) ? awayUserId : homeUserId;
        }

        private String usernameForSide(String side) {
            return "away".equals(side) ? awayUsername : homeUsername;
        }

        private String playerIdForActor(String actorId) {
            int slot = slotIndex(actorId);
            if (slot < 0) return "";
            List<PlayerSummary> lineup = actorId != null && actorId.startsWith("away-") ? awayLineup : homeLineup;
            if (slot >= lineup.size()) return "";
            return lineup.get(slot).id();
        }

        private List<PlayerPhysicsSummary> localPhysics(String localSide, String targetNetworkSide) {
            boolean targetIsAway = "away".equals(targetNetworkSide);
            boolean localHome = !"away".equals(localSide);
            List<PlayerSummary> lineup = targetIsAway
                    ? (localHome ? awayLineup : homeLineup)
                    : (localHome ? homeLineup : awayLineup);
            String actorSide = localHome ? "home" : "away";
            List<PlayerPhysicsSummary> result = new ArrayList<>();
            for (int i = 0; i < lineup.size(); i += 1) {
                result.add(physicsWithActorId(actorSide + "-" + (i + 1), lineup.get(i).physics()));
            }
            return result;
        }

        private String playerNameForId(String side, String playerId) {
            List<PlayerSummary> lineup = "away".equals(side) ? awayLineup : homeLineup;
            for (PlayerSummary player : lineup) {
                if (player.id().equals(playerId)) return player.name();
            }
            return playerId == null ? "" : playerId;
        }

        private void finishWithLoser(String loserSide, String message) {
            if (finished) return;
            loserNetworkSide = "away".equals(loserSide) ? "away" : "home";
            winnerNetworkSide = opponentSide(loserNetworkSide);
            finishMessage = message == null || message.isBlank() ? "联机同步失败" : message;
            finished = true;
        }

        private void finishWithWinner(String winnerSide, String message) {
            if (finished) return;
            winnerNetworkSide = "away".equals(winnerSide) ? "away" : "home";
            loserNetworkSide = opponentSide(winnerNetworkSide);
            finishMessage = message == null || message.isBlank() ? "比赛结束" : message;
            finished = true;
        }

    }

    private static final class OnlineActionState {
        private long seq;
        private final Long actorUserId;
        private final String actorRequestId;
        private final String actorNetworkSide;
        private final OnlineShootCommandDto command;
        private final long createdAtMillis;

        private OnlineActionState(Long actorUserId, String actorRequestId, String actorNetworkSide, OnlineShootCommandDto command, long createdAtMillis) {
            this.actorUserId = actorUserId;
            this.actorRequestId = actorRequestId;
            this.actorNetworkSide = actorNetworkSide;
            this.command = command;
            this.createdAtMillis = createdAtMillis;
        }
    }

    private static final class SettlementPlayerGoalCount {
        private final long userId;
        private final String username;
        private final String side;
        private final String actorId;
        private final String playerId;
        private final String playerName;
        private int goals;
        private int firstOrder;

        private SettlementPlayerGoalCount(SettlementGoalDto goal) {
            this.userId = goal.userId();
            this.username = goal.username();
            this.side = goal.side();
            this.actorId = goal.actorId();
            this.playerId = goal.playerId();
            this.playerName = goal.playerName();
            this.goals = 0;
            this.firstOrder = goal.order();
        }

        private int goals() {
            return goals;
        }

        private int firstOrder() {
            return firstOrder;
        }

        private BestPlayerDto toDto() {
            return new BestPlayerDto(userId, username, side, actorId, playerId, playerName, goals);
        }
    }

    private static List<PointRatio> ratios(double... values) {
        List<PointRatio> result = new ArrayList<>();
        for (int i = 0; i + 1 < values.length; i += 2) {
            result.add(new PointRatio(values[i], values[i + 1]));
        }
        return result;
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
