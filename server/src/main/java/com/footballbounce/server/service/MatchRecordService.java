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
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.repository.MatchRecordMapper;
import java.util.ArrayList;
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
        List<MatchRecordSummary> records = mapper.findRecentRecords(userId, guestOnly, guestSessionId, limit)
                .stream()
                .map(MatchRecordService::recordSummary)
                .toList();
        return new RecentResponse(true, "查询成功", records);
    }

    public ReplayResponse replay(ReplayRequest request) {
        if (request == null || request.matchId() == null || request.matchId().isBlank()) {
            return new ReplayResponse(false, "比赛编号为空", null, List.of(), List.of(), List.of());
        }
        long userId = request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request.guestSessionId());
        boolean guestOnly = userId == GUEST_USER_ID;
        if (guestOnly && guestSessionId.isBlank()) {
            return new ReplayResponse(false, "游客会话已失效", null, List.of(), List.of(), List.of());
        }
        Map<String, Object> row = mapper.findOwnedFinishedRecord(request.matchId(), userId, guestOnly, guestSessionId);
        if (row == null) {
            return new ReplayResponse(false, "未查询到该场已完成比赛", null, List.of(), List.of(), List.of());
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
        return new ReplayResponse(true, "查询成功", replayRecord, homeLineup, awayLineup, actions);
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
}
