package com.footballbounce.server.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.footballbounce.server.dto.UserSummaryDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.AbandonRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AbandonResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiKeeperRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiKeeperResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiShootRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiShootResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.BestPlayerDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.BodyDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.FinishRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.FinishResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.MatchEventRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.MatchEventResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerPhysicsSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.ScoreDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementGoalDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.ShootCommandDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.ShootRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.ShootResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotValidationRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotValidationResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.StartRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.StartResponse;
import com.footballbounce.server.repository.SingleMatchMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SingleMatchService {

    private static final long GUEST_USER_ID = 1L;
    private static final long MATCH_DURATION_MILLIS = 180_000L;
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
    private static final double POSITION_TOLERANCE = 18;
    private static final double VELOCITY_TOLERANCE = 12;

    private static final Map<String, List<PointRatio>> FORMATIONS = Map.of(
            "balanced-221", ratios(-0.18, -0.34, 0.18, -0.34, -0.16, -0.22, 0.16, -0.22, 0, -0.08),
            "midfield-131", ratios(0, -0.35, -0.22, -0.22, 0, -0.22, 0.22, -0.22, 0, -0.08),
            "defense-311", ratios(-0.23, -0.35, 0, -0.35, 0.23, -0.35, 0, -0.21, 0, -0.08),
            "attack-122", ratios(0, -0.35, -0.18, -0.23, 0.18, -0.23, -0.16, -0.08, 0.16, -0.08),
            "diamond-212", ratios(-0.19, -0.35, 0.19, -0.35, 0, -0.22, -0.18, -0.08, 0.18, -0.08)
    );

    private final SingleMatchMapper mapper;
    private final MatchRewardService matchRewardService;
    private final ObjectMapper objectMapper;
    private final Random random = new Random();
    private final Map<String, ServerMatchState> matches = new ConcurrentHashMap<>();

    public SingleMatchService(
            SingleMatchMapper mapper,
            MatchRewardService matchRewardService,
            ObjectMapper objectMapper
    ) {
        this.mapper = mapper;
        this.matchRewardService = matchRewardService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public StartResponse start(StartRequest request) {
        long userId = request.userId() == null ? GUEST_USER_ID : request.userId();
        Map<String, Object> user = mapper.findUser(userId);
        if (user == null) {
            return startFailed("未查询到用户");
        }
        Map<String, Object> lineup = mapper.findUserLineup(userId);
        if (lineup == null) {
            return startFailed("当前用户还没有保存阵容");
        }
        String formationId = stringValue(lineup.get("selectedFormationId"));
        List<String> playerIds = List.of(
                stringValue(lineup.get("slot1PlayerId")),
                stringValue(lineup.get("slot2PlayerId")),
                stringValue(lineup.get("slot3PlayerId")),
                stringValue(lineup.get("slot4PlayerId")),
                stringValue(lineup.get("slot5PlayerId"))
        );
        if (playerIds.stream().anyMatch(String::isBlank)) {
            return startFailed("当前用户阵容不完整");
        }
        List<PlayerSummary> lineupPlayers = loadLineupPlayers(playerIds);
        if (lineupPlayers.size() != playerIds.size()) {
            return startFailed("阵容中存在未找到的球员");
        }
        String matchNo = "single-" + UUID.randomUUID();
        String username = displayName(user);
        double fieldWidth = positiveOrDefault(request.fieldWidth(), DEFAULT_FIELD_WIDTH);
        double fieldHeight = positiveOrDefault(request.fieldHeight(), DEFAULT_FIELD_HEIGHT);
        String clientSessionId = safeSessionId(request.clientSessionId());
        ServerMatchState state = new ServerMatchState(matchNo, userId, username, clientSessionId, formationId, playerIds, lineupPlayers, fieldWidth, fieldHeight);
        state.resetObjects("home");
        mapper.insertMatchRecord(matchNo, userId, username, "home", clientSessionId, "single", null, "人机", formationId, formationId, String.join(",", playerIds), String.join(",", playerIds));
        matches.put(matchNo, state);
        recordAction(state, "server", null, "start", null, true, "match started");
        return new StartResponse(
                true,
                "单人比赛已创建",
                matchNo,
                userId,
                username,
                formationId,
                formationId,
                lineupPlayers,
                lineupPlayers,
                state.snapshot()
        );
    }

    @Transactional
    public ShootResponse submitShoot(ShootRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new ShootResponse(false, "比赛不存在或已过期", null);
        }
        ShootCommandDto command = normalizeCommand(request.command(), state.matchNo);
        if (!state.applyCommand(command)) {
            recordAction(state, command.side(), command.actorId(), "shoot-rejected", command, false, "指令不符合当前回合");
            return new ShootResponse(false, "指令不符合当前回合", state.snapshot());
        }
        state.simulateUntilSettled();
        SnapshotDto expected = state.snapshot();
        recordAction(state, command.side(), command.actorId(), "shoot", command, true, "accepted");
        return new ShootResponse(true, "已接收用户操作", expected);
    }

    @Transactional
    public AiShootResponse requestAiShoot(AiShootRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new AiShootResponse(false, "比赛不存在或已过期", null, null);
        }
        if ("penalty".equalsIgnoreCase(request.phase())) {
            String actorId = request.actorId() == null || request.actorId().isBlank() ? "away-1" : request.actorId();
            double actorX = request.actorX() == null ? 0 : request.actorX();
            double actorY = request.actorY() == null ? state.goalLineY() - 174 : request.actorY();
            double targetX = (random.nextDouble() - 0.5) * GOAL_HALF_WIDTH * 1.45;
            double targetY = state.goalLineY() + 8;
            double maxPower = state.powerScaleForActor(actorId);
            ShootCommandDto command = new ShootCommandDto(
                    "server-ai-penalty-" + System.currentTimeMillis() + "-" + random.nextInt(10000),
                    state.matchNo,
                    actorId,
                    "away",
                    Math.atan2(targetY - actorY, targetX - actorX),
                    maxPower * (0.72 + random.nextDouble() * 0.18),
                    0.0,
                    0.0,
                    state.fieldWidth,
                    state.fieldHeight,
                    System.currentTimeMillis()
            );
            recordAction(state, "away", actorId, "ai-penalty", command, true, "accepted");
            return new AiShootResponse(true, "已生成人机点球操作", command, state.snapshot());
        }
        if (!"away".equals(state.turn) || !state.isSettled()) {
            return new AiShootResponse(false, "当前不是人机可操作状态", null, state.snapshot());
        }
        Body actor = state.awayPlayers()
                .stream()
                .min(Comparator.comparingDouble(player -> distSq(player.x, player.y, state.ball.x, state.ball.y)))
                .orElse(null);
        if (actor == null) {
            return new AiShootResponse(false, "人机阵容为空", null, state.snapshot());
        }
        double maxPower = state.powerScaleForActor(actor.id);
        ShootCommandDto command = new ShootCommandDto(
                "server-ai-" + System.currentTimeMillis() + "-" + random.nextInt(10000),
                state.matchNo,
                actor.id,
                "away",
                Math.atan2(state.ball.y - actor.y, state.ball.x - actor.x),
                maxPower * (0.66 + random.nextDouble() * 0.08),
                0.0,
                0.0,
                state.fieldWidth,
                state.fieldHeight,
                System.currentTimeMillis()
        );
        state.applyCommand(command);
        state.simulateUntilSettled();
        SnapshotDto expected = state.snapshot();
        recordAction(state, "away", actor.id, "ai-shoot", command, true, "accepted");
        return new AiShootResponse(true, "已生成人机操作", command, expected);
    }

    @Transactional
    public AiKeeperResponse requestAiKeeper(AiKeeperRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new AiKeeperResponse(false, "比赛不存在或已过期", 0);
        }
        int direction = random.nextInt(3) - 1;
        recordAction(state, "away", "away-1", "ai-keeper", Map.of("direction", direction), true, "accepted");
        return new AiKeeperResponse(true, "已生成人机守门方向", direction);
    }

    @Transactional
    public SnapshotValidationResponse validateSnapshot(SnapshotValidationRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new SnapshotValidationResponse(false, false, "比赛不存在或已过期", null, List.of(), List.of());
        }
        SnapshotDto incoming = request.snapshot();
        String phase = request.phase() == null ? "" : request.phase().trim().toLowerCase(Locale.ROOT);
        if ("kickoff-reset".equals(phase)) {
            state.replaceFromSnapshot(incoming);
            recordAction(state, incoming.turn(), null, "kickoff-reset", null, true, "kickoff reset accepted");
            return new SnapshotValidationResponse(true, true, "开球快照已同步", state.snapshot(), state.physicsForSide("home"), state.physicsForSide("away"));
        }
        SnapshotDto expected = state.snapshot();
        String mismatch = state.compareSnapshot(incoming);
        boolean valid = mismatch.isEmpty();
        if (valid) {
            state.replaceFromSnapshot(incoming);
            expected = state.snapshot();
        }
        recordAction(state, incoming.turn(), null, "snapshot-validate", null, valid, valid ? "valid" : mismatch);
        return new SnapshotValidationResponse(
                true,
                valid,
                valid ? "校验通过" : mismatch,
                expected,
                valid ? state.physicsForSide("home") : List.of(),
                valid ? state.physicsForSide("away") : List.of()
        );
    }

    @Transactional
    public MatchEventResponse recordEvent(MatchEventRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new MatchEventResponse(false, "比赛不存在或已过期");
        }
        if (request.score() != null) {
            state.scoreHome = request.score().home();
            state.scoreAway = request.score().away();
        }
        if ("goal".equals(request.type())) {
            state.recordGoal(request, mapper);
        }
        recordAction(state, safeSide(request.side()), request.actorId(), "event-" + request.type(), request, true, "event recorded");
        return new MatchEventResponse(true, "事件已记录");
    }

    @Transactional
    public FinishResponse finish(FinishRequest request) {
        ServerMatchState state = matches.get(request.matchId());
        if (state == null) {
            return new FinishResponse(false, "比赛不存在或已过期", null, null);
        }
        int duration = request.durationSeconds() == null ? 0 : Math.max(0, request.durationSeconds());
        String resultScore = request.resultScore() == null ? state.scoreHome + ":" + state.scoreAway : request.resultScore();
        String result = request.result() == null ? "" : request.result();
        SettlementDto settlement = state.settlement(result, resultScore);
        mapper.finishMatch(state.matchNo, state.userId, duration, settlement.scoreText(), result);
        UserSummaryDto summary = recordMatchResult(state, result);
        recordAction(state, "server", null, "end", request, true, "match finished");
        matches.remove(state.matchNo);
        return new FinishResponse(true, "比赛结果已保存", settlement, summary);
    }

    @Transactional
    public AbandonResponse abandon(AbandonRequest request) {
        if (request == null || request.matchId() == null || request.matchId().isBlank()) {
            return new AbandonResponse(false, "比赛编号为空");
        }
        long userId = request.userId() == null ? GUEST_USER_ID : request.userId();
        ServerMatchState state = matches.remove(request.matchId());
        String matchNo = state == null ? request.matchId() : state.matchNo;
        if (mapper.countUnfinishedMatch(matchNo, userId) <= 0) {
            return new AbandonResponse(true, "没有需要清理的未完成比赛");
        }
        return new AbandonResponse(true, "未完成比赛已保留");
    }

    private UserSummaryDto recordMatchResult(ServerMatchState state, String result) {
        boolean win = "win".equalsIgnoreCase(result == null ? "" : result.trim());
        return matchRewardService.recordSingleMatchResult(state.userId, state.matchNo, win);
    }

    private StartResponse startFailed(String message) {
        return new StartResponse(false, message, null, null, null, null, null, List.of(), List.of(), null);
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
            if (player != null) {
                ordered.add(player);
            }
        }
        return ordered;
    }

    private ShootCommandDto normalizeCommand(ShootCommandDto command, String matchNo) {
        return new ShootCommandDto(
                blankToDefault(command.commandId(), "client-" + System.currentTimeMillis()),
                matchNo,
                command.actorId(),
                command.side(),
                command.angleRad(),
                command.power(),
                command.curveAngleRad(),
                command.curveDistance(),
                command.fieldWidth(),
                command.fieldHeight(),
                command.clientTick()
        );
    }

    private void recordAction(
            ServerMatchState state,
            String actorSide,
            String actorId,
            String actionType,
            Object command,
            Boolean valid,
            String message
    ) {
        if (!shouldPersistReplayAction(actionType)) return;
        String safeSide = safeSide(actorSide);
        int matchSecond = state.actionMatchSecond(command);
        mapper.insertAction(
                state.matchNo,
                state.nextActionIndex(),
                state.userIdForSide(safeSide),
                safeSide,
                actorId,
                actionType,
                matchSecond,
                toJson(command),
                valid,
                message
        );
    }

    private static boolean shouldPersistReplayAction(String actionType) {
        return "start".equals(actionType)
                || "shoot".equals(actionType)
                || "ai-shoot".equals(actionType)
                || "ai-penalty".equals(actionType)
                || "ai-keeper".equals(actionType)
                || "end".equals(actionType);
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return "{\"jsonError\":true}";
        }
    }

    private static String displayName(Map<String, Object> user) {
        String displayName = stringValue(user.get("displayName"));
        return displayName.isBlank() ? stringValue(user.get("username")) : displayName;
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String safeSessionId(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > 96) {
            return trimmed.substring(0, 96);
        }
        return trimmed;
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(stringValue(value));
        } catch (NumberFormatException ex) {
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
            } catch (NumberFormatException ex) {
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

    private static int rarityRank(String rarity) {
        return switch (stringValue(rarity)) {
            case "red" -> 0;
            case "orange" -> 1;
            case "purple" -> 2;
            default -> 3;
        };
    }

    private static double positiveOrDefault(Double value, double fallback) {
        return value == null || value <= 0 ? fallback : value;
    }

    private static String safeSide(String side) {
        if ("home".equals(side) || "away".equals(side) || "server".equals(side)) {
            return side;
        }
        return "server";
    }

    private static double distSq(double ax, double ay, double bx, double by) {
        double dx = ax - bx;
        double dy = ay - by;
        return dx * dx + dy * dy;
    }

    private static List<PointRatio> ratios(double... values) {
        List<PointRatio> result = new ArrayList<>();
        for (int i = 0; i + 1 < values.length; i += 2) {
            result.add(new PointRatio(values[i], values[i + 1]));
        }
        return result;
    }

    private record PointRatio(double x, double y) {
    }

    private static final class CurveMotion {
        private double remainingAngle;
        private double remainingDistance;

        private CurveMotion(double remainingAngle, double remainingDistance) {
            this.remainingAngle = remainingAngle;
            this.remainingDistance = remainingDistance;
        }
    }

    private static final class PlayerGoalCount {
        private final long userId;
        private final String username;
        private final String side;
        private final String actorId;
        private final String playerId;
        private final String playerName;
        private int goals;
        private int firstOrder;

        private PlayerGoalCount(SettlementGoalDto goal) {
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

        private void replace(BodyDto dto) {
            this.x = dto.x();
            this.y = dto.y();
            this.vx = dto.vx();
            this.vy = dto.vy();
        }
    }

    private static final class ServerMatchState {
        private final String matchNo;
        private final long userId;
        private final String username;
        private final String clientSessionId;
        private final String formationId;
        private final List<String> lineupIds;
        private final Map<String, PlayerSummary> lineupByPlayerId = new HashMap<>();
        private final double fieldWidth;
        private final double fieldHeight;
        private final long startedAtMillis = System.currentTimeMillis();
        private final AtomicInteger actionIndex = new AtomicInteger();
        private final AtomicInteger goalOrder = new AtomicInteger();
        private final Set<String> recordedGoalEvents = ConcurrentHashMap.newKeySet();
        private final List<SettlementGoalDto> goals = new ArrayList<>();
        private final List<Body> players = new ArrayList<>();
        private final Map<String, CurveMotion> activeCurves = new HashMap<>();
        private Body ball;
        private String turn = "home";
        private int scoreHome = 0;
        private int scoreAway = 0;
        private boolean goalLocked = false;
        private long tick = 0;

        private ServerMatchState(String matchNo, long userId, String username, String clientSessionId, String formationId, List<String> lineupIds, List<PlayerSummary> lineupPlayers, double fieldWidth, double fieldHeight) {
            this.matchNo = matchNo;
            this.userId = userId;
            this.username = username;
            this.clientSessionId = clientSessionId;
            this.formationId = formationId;
            this.lineupIds = List.copyOf(lineupIds);
            for (PlayerSummary player : lineupPlayers) {
                this.lineupByPlayerId.put(player.id(), player);
            }
            this.fieldWidth = fieldWidth;
            this.fieldHeight = fieldHeight;
        }

        private int nextActionIndex() {
            return actionIndex.incrementAndGet();
        }

        private long userIdForSide(String side) {
            if ("home".equals(side)) {
                return userId;
            }
            if ("away".equals(side)) {
                return 0L;
            }
            return 0L;
        }

        private int actionMatchSecond(Object command) {
            if (command instanceof MatchEventRequest event) {
                if (Boolean.TRUE.equals(event.penalty())) {
                    return -1;
                }
                if (event.matchSecond() != null) {
                    return Math.max(0, Math.min((int) (MATCH_DURATION_MILLIS / 1000), event.matchSecond()));
                }
            }
            if (command instanceof FinishRequest finish && finish.durationSeconds() != null) {
                return Math.max(0, Math.min((int) (MATCH_DURATION_MILLIS / 1000), finish.durationSeconds()));
            }
            long elapsed = System.currentTimeMillis() - startedAtMillis;
            return (int) Math.max(0, Math.min(MATCH_DURATION_MILLIS, elapsed) / 1000);
        }

        private String usernameForSide(String side) {
            return "home".equals(side) ? username : "人机";
        }

        private String sideForActor(String actorId, String fallbackSide) {
            if (actorId != null && actorId.startsWith("home-")) {
                return "home";
            }
            if (actorId != null && actorId.startsWith("away-")) {
                return "away";
            }
            return fallbackSide;
        }

        private String playerIdForActor(String actorId) {
            int slot = slotIndex(actorId);
            if (slot < 0 || slot >= lineupIds.size()) {
                return "";
            }
            return lineupIds.get(slot);
        }

        private String playerNameForId(String playerId) {
            PlayerSummary player = lineupByPlayerId.get(playerId);
            return player == null ? playerId : player.name();
        }

        private PlayerSummary playerForActor(String actorId) {
            return lineupByPlayerId.get(playerIdForActor(actorId));
        }

        private List<PlayerPhysicsSummary> physicsForSide(String side) {
            String actorSide = "away".equals(side) ? "away" : "home";
            List<PlayerPhysicsSummary> result = new ArrayList<>();
            for (int i = 0; i < lineupIds.size(); i += 1) {
                PlayerSummary player = lineupByPlayerId.get(lineupIds.get(i));
                if (player != null) {
                    result.add(physicsWithActorId(actorSide + "-" + (i + 1), player.physics()));
                }
            }
            return result;
        }

        private double powerScaleForActor(String actorId) {
            PlayerSummary player = playerForActor(actorId);
            return player == null || player.physics() == null ? 1 : player.physics().shotPowerScale();
        }

        private double maxCurveAngleForActor(String actorId) {
            PlayerSummary player = playerForActor(actorId);
            return player == null || player.physics() == null ? MAX_CURVE_ANGLE_AT_FULL_SCORE : player.physics().maxCurveAngleRad();
        }

        private void recordGoal(MatchEventRequest request, SingleMatchMapper mapper) {
            String eventId = request.eventId() == null ? "" : request.eventId();
            if (!eventId.isBlank() && !recordedGoalEvents.add(eventId)) {
                return;
            }
            String side = safeSide(request.side());
            String actorId = request.actorId() == null || request.actorId().isBlank() ? side + "-1" : request.actorId();
            String actorSide = sideForActor(actorId, side);
            boolean penalty = Boolean.TRUE.equals(request.penalty());
            boolean ownGoal = Boolean.TRUE.equals(request.ownGoal()) || !actorSide.equals(side);
            int matchSecond = penalty ? -1 : Math.max(0, request.matchSecond() == null ? 0 : request.matchSecond());
            long scorerUserId = userIdForSide(actorSide);
            String scorerUsername = usernameForSide(actorSide);
            String playerId = playerIdForActor(actorId);
            String playerName = playerNameForId(playerId);
            int order = goalOrder.incrementAndGet();
            SettlementGoalDto goal = new SettlementGoalDto(
                    matchSecond,
                    penalty,
                    scorerUserId,
                    scorerUsername,
                    side,
                    actorId,
                    playerId,
                    playerName,
                    ownGoal,
                    order
            );
            goals.add(goal);
            mapper.insertGoal(matchNo, order, matchSecond, scorerUserId, scorerUsername, side, actorId, playerId, playerName, penalty, ownGoal);
        }

        private SettlementDto settlement(String result, String scoreText) {
            List<SettlementGoalDto> orderedGoals = goals.stream()
                    .filter(goal -> !goal.penalty())
                    .sorted(Comparator.comparingInt(SettlementGoalDto::matchSecond)
                            .thenComparingInt(SettlementGoalDto::order))
                    .toList();
            String winnerSide = "win".equals(result) ? "home" : "lose".equals(result) ? "away" : scoreHome > scoreAway ? "home" : "away";
            if (!"win".equals(result) && !"lose".equals(result) && scoreHome == scoreAway) {
                winnerSide = "draw";
            }
            BestPlayerDto best = bestPlayer(winnerSide);
            return new SettlementDto(matchNo, result, scoreText, winnerSide, best, orderedGoals);
        }

        private BestPlayerDto bestPlayer(String winnerSide) {
            if (!"home".equals(winnerSide) && !"away".equals(winnerSide)) {
                return null;
            }
            Map<String, PlayerGoalCount> counts = new HashMap<>();
            for (SettlementGoalDto goal : goals) {
                if (goal.ownGoal()) {
                    continue;
                }
                if (!winnerSide.equals(goal.side())) {
                    continue;
                }
                PlayerGoalCount current = counts.computeIfAbsent(goal.playerId(), ignored -> new PlayerGoalCount(goal));
                current.goals += 1;
                current.firstOrder = Math.min(current.firstOrder, goal.order());
            }
            return counts.values()
                    .stream()
                    .sorted(Comparator.comparingInt(PlayerGoalCount::goals).reversed().thenComparingInt(PlayerGoalCount::firstOrder))
                    .map(PlayerGoalCount::toDto)
                    .findFirst()
                    .orElseGet(() -> fallbackBestPlayer(winnerSide));
        }

        private BestPlayerDto fallbackBestPlayer(String winnerSide) {
            int bestSlot = -1;
            PlayerSummary best = null;
            for (int i = 0; i < lineupIds.size(); i += 1) {
                PlayerSummary player = lineupByPlayerId.get(lineupIds.get(i));
                if (player == null) {
                    continue;
                }
                if (best == null || rarityRank(player.rarity()) < rarityRank(best.rarity())) {
                    best = player;
                    bestSlot = i;
                }
            }
            if (best == null || bestSlot < 0) {
                return null;
            }
            long fallbackUserId = "home".equals(winnerSide) ? userId : 0L;
            String fallbackUsername = "home".equals(winnerSide) ? username : "人机";
            return new BestPlayerDto(fallbackUserId, fallbackUsername, winnerSide, winnerSide + "-" + (bestSlot + 1), best.id(), best.name(), 0);
        }

        private void resetObjects(String startingTurn) {
            players.clear();
            activeCurves.clear();
            turn = startingTurn;
            goalLocked = false;
            ball = makeBall(0, 0);
            List<PointRatio> formation = FORMATIONS.getOrDefault(formationId, FORMATIONS.get("balanced-221"));
            for (int i = 0; i < 5; i += 1) {
                PointRatio point = formation.get(Math.min(i, formation.size() - 1));
                players.add(makePlayer("home-" + (i + 1), "home", point.x * fieldWidth, point.y * fieldHeight));
            }
            for (int i = 0; i < 5; i += 1) {
                PointRatio point = formation.get(Math.min(i, formation.size() - 1));
                players.add(makePlayer("away-" + (i + 1), "away", point.x * fieldWidth, point.y * fieldHeight * -1));
            }
            resolveAllCollisions();
        }

        private boolean applyCommand(ShootCommandDto command) {
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
            if ("home".equals(turn)) {
                turn = "away";
            } else {
                turn = "home";
            }
            goalLocked = false;
            return true;
        }

        private void simulateUntilSettled() {
            int maxSteps = 120 * 18;
            double dt = 1.0 / 120.0;
            for (int i = 0; i < maxSteps; i += 1) {
                step(dt);
                tick += 1;
                if (i > 12 && isSettled()) {
                    break;
                }
            }
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
            if (!"player".equals(body.kind) || speed <= 0) {
                return;
            }
            CurveMotion curve = activeCurves.get(body.id);
            if (curve == null) {
                return;
            }
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
            if (speed >= lowSpeed) {
                return body.friction;
            }
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
            if (collideCornerCushions(body)) {
                collided = true;
            }
            if (collided) {
                activeCurves.remove(body.id);
            }
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
            if (dSq >= min * min) {
                return;
            }
            double d = Math.sqrt(dSq);
            if (d < 0.0001) {
                d = 0.0001;
            }
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
                if (dx * corner[2] > 0 || dy * corner[3] > 0) {
                    continue;
                }
                double min = CORNER_CUSHION_RADIUS + body.radius;
                double dSq = dx * dx + dy * dy;
                if (dSq >= min * min) {
                    continue;
                }
                double d = Math.sqrt(dSq);
                if (d < 0.0001) {
                    d = 0.0001;
                }
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
            if (d >= min) {
                return;
            }
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
            if (relNormalSpeed > 0) {
                return;
            }
            double restitution = collisionRestitution(a, b);
            double impulse = (-(1 + restitution) * relNormalSpeed) / invTotal;
            a.vx -= impulse * invA * nx;
            a.vy -= impulse * invA * ny;
            b.vx += impulse * invB * nx;
            b.vy += impulse * invB * ny;
        }

        private void checkGoal() {
            if (goalLocked || Math.abs(ball.x) > GOAL_HALF_WIDTH - ball.radius) {
                return;
            }
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

        private String compareSnapshot(SnapshotDto incoming) {
            if (incoming == null) {
                return "前端未上传场上快照";
            }
            if (incoming.score() == null || incoming.score().home() != scoreHome || incoming.score().away() != scoreAway) {
                return "比分与服务端计算结果不一致";
            }
            if (incoming.turn() != null && !incoming.turn().equals(turn)) {
                return "回合归属与服务端计算结果不一致";
            }
            Map<String, BodyDto> incomingBodies = new HashMap<>();
            if (incoming.players() != null) {
                for (BodyDto player : incoming.players()) {
                    incomingBodies.put(player.id(), player);
                }
            }
            incomingBodies.put("ball", incoming.ball());
            for (Body body : bodies()) {
                BodyDto client = incomingBodies.get(body.id);
                if (client == null) {
                    return body.id + " 未上传";
                }
                if (Math.abs(client.x() - body.x) > POSITION_TOLERANCE || Math.abs(client.y() - body.y) > POSITION_TOLERANCE) {
                    return body.id + " 位置与服务端计算结果不一致";
                }
                if (Math.abs(client.vx() - body.vx) > VELOCITY_TOLERANCE || Math.abs(client.vy() - body.vy) > VELOCITY_TOLERANCE) {
                    return body.id + " 速度与服务端计算结果不一致";
                }
            }
            return "";
        }

        private void replaceFromSnapshot(SnapshotDto snapshot) {
            if (snapshot == null) {
                return;
            }
            this.turn = snapshot.turn() == null ? this.turn : snapshot.turn();
            if (snapshot.score() != null) {
                this.scoreHome = snapshot.score().home();
                this.scoreAway = snapshot.score().away();
            }
            if (snapshot.tick() > this.tick) {
                this.tick = snapshot.tick();
            }
            if (snapshot.ball() != null) {
                this.ball.replace(snapshot.ball());
            }
            if (snapshot.players() != null) {
                Map<String, BodyDto> byId = new HashMap<>();
                for (BodyDto player : snapshot.players()) {
                    byId.put(player.id(), player);
                }
                for (Body player : players) {
                    BodyDto dto = byId.get(player.id);
                    if (dto != null) {
                        player.replace(dto);
                    }
                }
            }
            this.activeCurves.clear();
            this.goalLocked = Math.abs(ball.y) > goalLineY() && Math.abs(ball.x) <= GOAL_HALF_WIDTH;
        }

        private SnapshotDto snapshot() {
            List<BodyDto> playerDtos = players.stream().map(Body::dto).toList();
            return new SnapshotDto(matchNo, "ai", fieldWidth, fieldHeight, tick, turn, new ScoreDto(scoreHome, scoreAway), playerDtos, ball.dto());
        }

        private boolean isSettled() {
            for (Body body : bodies()) {
                if (Math.abs(body.vx) + Math.abs(body.vy) >= 1) {
                    return false;
                }
            }
            return true;
        }

        private List<Body> awayPlayers() {
            return players.stream().filter(player -> "away".equals(player.side)).toList();
        }

        private Body findBody(String id) {
            for (Body body : players) {
                if (body.id.equals(id)) {
                    return body;
                }
            }
            if (ball.id.equals(id)) {
                return ball;
            }
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
            if ("player".equals(a.kind) && "player".equals(b.kind)) {
                return 0.98;
            }
            if (!a.kind.equals(b.kind)) {
                return 0.88;
            }
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

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }

    private static int slotIndex(String actorId) {
        if (actorId == null) {
            return -1;
        }
        int dash = actorId.lastIndexOf('-');
        if (dash < 0 || dash + 1 >= actorId.length()) {
            return -1;
        }
        try {
            return Integer.parseInt(actorId.substring(dash + 1)) - 1;
        } catch (NumberFormatException ex) {
            return -1;
        }
    }
}
