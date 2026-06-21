package com.footballbounce.server.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.footballbounce.server.dto.match.MatchRecordDtos.GuestSessionClearRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.GuestSessionClearResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.MatchActionDto;
import com.footballbounce.server.dto.match.MatchRecordDtos.MatchRecordSummary;
import com.footballbounce.server.dto.match.MatchRecordDtos.RecentRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.RecentResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.ReplayRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.ReplayResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.SettlementResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.BestPlayerDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementGoalDto;
import com.footballbounce.server.repository.MatchRecordMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MatchRecordService {

    private static final long GUEST_USER_ID = 1L;

    private final MatchRecordMapper mapper;
    private final ObjectMapper objectMapper;

    public MatchRecordService(MatchRecordMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public RecentResponse recent(RecentRequest request) {
        long userId = request == null || request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request == null ? "" : request.guestSessionId());
        boolean guestOnly = userId == GUEST_USER_ID;
        if (guestOnly && guestSessionId.isBlank()) {
            return new RecentResponse(true, "游客本次登录没有比赛记录", List.of());
        }
        int limit = Math.max(1, Math.min(50, request == null || request.limit() == null ? 20 : request.limit()));
        int offset = Math.max(0, request == null || request.offset() == null ? 0 : request.offset());
        List<MatchRecordSummary> records = mapper.findRecentRecords(userId, guestOnly, guestSessionId, limit, offset)
                .stream()
                .map(MatchRecordService::recordSummary)
                .toList();
        return new RecentResponse(true, "查询成功", records);
    }

    public ReplayResponse replay(ReplayRequest request) {
        if (request == null || request.matchId() == null || request.matchId().isBlank()) {
            return new ReplayResponse(false, "比赛编号为空", null, false, List.of(), List.of(), List.of());
        }
        long userId = request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request.guestSessionId());
        boolean guestOnly = userId == GUEST_USER_ID;
        if (guestOnly && guestSessionId.isBlank()) {
            return new ReplayResponse(false, "游客会话已失效", null, false, List.of(), List.of(), List.of());
        }
        Map<String, Object> row = mapper.findOwnedFinishedRecord(request.matchId(), userId, guestOnly, guestSessionId);
        if (row == null) {
            return new ReplayResponse(false, "未查询到该场已完成比赛", null, false, List.of(), List.of(), List.of());
        }
        MatchRecordSummary record = recordSummary(row);
        boolean mirrorForAway = "online".equals(record.matchType()) && "away".equals(record.userSide());
        MatchRecordSummary replayRecord = mirrorForAway ? mirrorRecord(record) : record;
        List<PlayerSummary> homeLineup = loadLineup(replayRecord.homeLineupPlayerIds());
        List<PlayerSummary> awayLineup = loadLineup(replayRecord.awayLineupPlayerIds());
        List<MatchActionDto> actions = mapper.findActions(record.matchId())
                .stream()
                .map(MatchRecordService::actionDto)
                .map(action -> mirrorForAway ? mirrorAction(action) : action)
                .toList();
        return new ReplayResponse(true, "查询成功", replayRecord, mirrorForAway, homeLineup, awayLineup, actions);
    }

    public SettlementResponse settlement(ReplayRequest request) {
        if (request == null || request.matchId() == null || request.matchId().isBlank()) {
            return new SettlementResponse(false, "比赛编号为空", null);
        }
        long userId = request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request.guestSessionId());
        boolean guestOnly = userId == GUEST_USER_ID;
        if (guestOnly && guestSessionId.isBlank()) {
            return new SettlementResponse(false, "游客会话已失效", null);
        }
        Map<String, Object> row = mapper.findOwnedFinishedRecord(request.matchId(), userId, guestOnly, guestSessionId);
        if (row == null) {
            return new SettlementResponse(false, "未查询到该场已完成比赛", null);
        }
        MatchRecordSummary record = recordSummary(row);
        boolean mirrorForAway = "online".equals(record.matchType()) && "away".equals(record.userSide());
        MatchRecordSummary replayRecord = mirrorForAway ? mirrorRecord(record) : record;
        return new SettlementResponse(true, "查询成功", replaySettlement(record, replayRecord, mirrorForAway));
    }

    @Transactional
    public GuestSessionClearResponse clearGuestSession(GuestSessionClearRequest request) {
        long userId = request == null || request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request == null ? "" : request.guestSessionId());
        if (userId != GUEST_USER_ID || guestSessionId.isBlank()) {
            return new GuestSessionClearResponse(true, "没有需要清理的游客记录");
        }
        return new GuestSessionClearResponse(true, "游客比赛记录已保留");
    }

    private MatchRecordSummary mirrorRecord(MatchRecordSummary record) {
        return new MatchRecordSummary(
                record.matchId(),
                record.matchTime(),
                record.matchType(),
                record.durationSeconds(),
                record.userId(),
                record.username(),
                "home",
                record.opponentUserId(),
                record.opponentUsername(),
                record.resultScore(),
                record.result(),
                record.awayFormationId(),
                record.homeFormationId(),
                record.awayLineupPlayerIds(),
                record.homeLineupPlayerIds()
        );
    }

    private MatchActionDto mirrorAction(MatchActionDto action) {
        return new MatchActionDto(
                action.actionIndex(),
                action.actorUserId(),
                mirrorSide(action.actorSide()),
                mirrorPlayerId(action.actorId()),
                action.actionType(),
                action.matchSecond(),
                mirrorCommandJson(action.commandJson()),
                action.validResult(),
                action.validationMessage(),
                action.createdAt()
        );
    }

    private String mirrorCommandJson(String commandJson) {
        if (commandJson == null || commandJson.isBlank()) {
            return commandJson;
        }
        try {
            Map<String, Object> payload = objectMapper.readValue(commandJson, new TypeReference<Map<String, Object>>() {});
            Object actorId = payload.get("actorId");
            if (actorId instanceof String actorText) {
                payload.put("actorId", mirrorPlayerId(actorText));
            }
            Object side = payload.get("side");
            if (side instanceof String sideText) {
                payload.put("side", mirrorSide(sideText));
            }
            Object angle = payload.get("angleRad");
            if (angle instanceof Number number) {
                payload.put("angleRad", rotateHalfTurnAngle(number.doubleValue()));
            }
            Object score = payload.get("score");
            if (score instanceof Map<?, ?> scoreMap) {
                Object home = scoreMap.get("home");
                Object away = scoreMap.get("away");
                Map<String, Object> mirroredScore = new HashMap<>();
                mirroredScore.put("home", away);
                mirroredScore.put("away", home);
                payload.put("score", mirroredScore);
            }
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return commandJson;
        }
    }

    private SettlementDto replaySettlement(MatchRecordSummary originalRecord, MatchRecordSummary replayRecord, boolean mirrorForAway) {
        List<SettlementGoalDto> goals = mapper.findGoalsByMatchNo(originalRecord.matchId())
                .stream()
                .map(MatchRecordService::goalDto)
                .map(goal -> mirrorForAway ? mirrorGoal(goal) : goal)
                .filter(goal -> !goal.penalty())
                .sorted(Comparator.comparingInt(SettlementGoalDto::matchSecond)
                        .thenComparingInt(SettlementGoalDto::order))
                .toList();
        String winnerSide = winnerSide(replayRecord.result(), replayRecord.resultScore());
        return new SettlementDto(
                replayRecord.matchId(),
                replayRecord.result(),
                replayRecord.resultScore(),
                winnerSide,
                bestPlayer(winnerSide, goals, replayRecord),
                goals
        );
    }

    private static SettlementGoalDto mirrorGoal(SettlementGoalDto goal) {
        return new SettlementGoalDto(
                goal.matchSecond(),
                goal.penalty(),
                goal.userId(),
                goal.username(),
                mirrorSide(goal.side()),
                mirrorPlayerId(goal.actorId()),
                goal.playerId(),
                goal.playerName(),
                goal.ownGoal(),
                goal.order()
        );
    }

    private static SettlementGoalDto goalDto(Map<String, Object> row) {
        return new SettlementGoalDto(
                intValue(row.get("matchSecond")),
                booleanValue(row.get("penalty")),
                longValue(row.get("userId")),
                stringValue(row.get("username")),
                stringValue(row.get("side")),
                stringValue(row.get("actorId")),
                stringValue(row.get("playerId")),
                stringValue(row.get("playerName")),
                booleanValue(row.get("ownGoal")),
                intValue(row.get("goalOrder"))
        );
    }

    private static String winnerSide(String result, String scoreText) {
        String value = result == null ? "" : result.trim().toLowerCase();
        if ("win".equals(value)) return "home";
        if ("lose".equals(value)) return "away";
        int[] score = parseScoreText(scoreText);
        if (score[0] > score[1]) return "home";
        if (score[1] > score[0]) return "away";
        return "draw";
    }

    private static int[] parseScoreText(String scoreText) {
        String[] parts = stringValue(scoreText).replace('：', ':').split(":");
        if (parts.length < 2) return new int[] {0, 0};
        return new int[] {leadingInt(parts[0]), leadingInt(parts[1])};
    }

    private static int leadingInt(String text) {
        String value = stringValue(text);
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

    private BestPlayerDto bestPlayer(String winnerSide, List<SettlementGoalDto> goals, MatchRecordSummary record) {
        if (!"home".equals(winnerSide) && !"away".equals(winnerSide)) {
            return null;
        }
        Map<String, PlayerGoalCount> counts = new HashMap<>();
        for (SettlementGoalDto goal : goals) {
            if (goal.ownGoal() || !winnerSide.equals(goal.side())) {
                continue;
            }
            String key = goal.playerId() == null || goal.playerId().isBlank() ? goal.actorId() : goal.playerId();
            PlayerGoalCount current = counts.computeIfAbsent(key, ignored -> new PlayerGoalCount(goal));
            current.goals += 1;
            current.firstOrder = Math.min(current.firstOrder, goal.order());
        }
        return counts.values()
                .stream()
                .sorted(Comparator.comparingInt(PlayerGoalCount::goals).reversed()
                        .thenComparingInt(PlayerGoalCount::firstOrder))
                .map(PlayerGoalCount::toDto)
                .findFirst()
                .orElseGet(() -> fallbackBestPlayer(winnerSide, record));
    }

    private BestPlayerDto fallbackBestPlayer(String winnerSide, MatchRecordSummary record) {
        String idsText = "home".equals(winnerSide) ? record.homeLineupPlayerIds() : record.awayLineupPlayerIds();
        List<PlayerSummary> lineup = loadLineup(idsText);
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
        long userId = "home".equals(winnerSide) ? record.userId() : (record.opponentUserId() == null ? 0L : record.opponentUserId());
        String username = "home".equals(winnerSide) ? record.username() : record.opponentUsername();
        return new BestPlayerDto(userId, username, winnerSide, winnerSide + "-" + (bestSlot + 1), best.id(), best.name(), 0);
    }

    private static int rarityRank(String rarity) {
        return switch (stringValue(rarity)) {
            case "red" -> 0;
            case "orange" -> 1;
            case "purple" -> 2;
            default -> 3;
        };
    }

    private static String mirrorSide(String side) {
        if ("home".equals(side)) return "away";
        if ("away".equals(side)) return "home";
        return side;
    }

    private static String mirrorPlayerId(String id) {
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

    private static double rotateHalfTurnAngle(double angle) {
        return normalizeAngle(angle + Math.PI);
    }

    private List<PlayerSummary> loadLineup(String idsText) {
        List<String> ids = splitIds(idsText);
        if (ids.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> rows = mapper.findPlayersByIds(ids);
        Map<String, PlayerSummary> byId = new HashMap<>();
        for (Map<String, Object> row : rows) {
            PlayerSummary player = new PlayerSummary(
                    stringValue(row.get("id")),
                    stringValue(row.get("name")),
                    intValue(row.get("score")),
                    stringValue(row.get("rarity")),
                    intValue(row.get("avatarSeed"))
            );
            byId.put(player.id(), player);
        }
        List<PlayerSummary> ordered = new ArrayList<>();
        for (String id : ids) {
            PlayerSummary player = byId.get(id);
            if (player != null) {
                ordered.add(player);
            }
        }
        return ordered;
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

    private static MatchRecordSummary recordSummary(Map<String, Object> row) {
        return new MatchRecordSummary(
                stringValue(row.get("matchId")),
                stringValue(row.get("matchTime")),
                stringValue(row.get("matchType")),
                intValue(row.get("durationSeconds")),
                longValue(row.get("userId")),
                stringValue(row.get("username")),
                stringValue(row.get("userSide")),
                nullableLong(row.get("opponentUserId")),
                stringValue(row.get("opponentUsername")),
                stringValue(row.get("resultScore")),
                stringValue(row.get("result")),
                stringValue(row.get("homeFormationId")),
                stringValue(row.get("awayFormationId")),
                stringValue(row.get("homeLineupPlayerIds")),
                stringValue(row.get("awayLineupPlayerIds"))
        );
    }

    private static MatchActionDto actionDto(Map<String, Object> row) {
        return new MatchActionDto(
                intValue(row.get("actionIndex")),
                longValue(row.get("actorUserId")),
                stringValue(row.get("actorSide")),
                stringValue(row.get("actorId")),
                stringValue(row.get("actionType")),
                intValue(row.get("matchSecond")),
                stringValue(row.get("commandJson")),
                boolValue(row.get("validResult")),
                stringValue(row.get("validationMessage")),
                stringValue(row.get("createdAt"))
        );
    }

    private static String safeSessionId(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() > 96 ? trimmed.substring(0, 96) : trimmed;
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
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

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(stringValue(value));
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }

    private static Long nullableLong(Object value) {
        if (value == null) {
            return null;
        }
        long parsed = longValue(value);
        return parsed == 0 ? null : parsed;
    }

    private static Boolean boolValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return Boolean.parseBoolean(stringValue(value));
    }

    private static boolean booleanValue(Object value) {
        Boolean parsed = boolValue(value);
        return parsed != null && parsed;
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
}
