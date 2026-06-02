package com.footballbounce.server.service;

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

    public MatchRecordService(MatchRecordMapper mapper) {
        this.mapper = mapper;
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
        List<PlayerSummary> homeLineup = loadLineup(record.homeLineupPlayerIds());
        List<PlayerSummary> awayLineup = loadLineup(record.awayLineupPlayerIds());
        List<MatchActionDto> actions = mapper.findActions(record.matchId())
                .stream()
                .map(MatchRecordService::actionDto)
                .toList();
        return new ReplayResponse(true, "查询成功", record, homeLineup, awayLineup, actions);
    }

    @Transactional
    public GuestSessionClearResponse clearGuestSession(GuestSessionClearRequest request) {
        long userId = request == null || request.userId() == null ? GUEST_USER_ID : request.userId();
        String guestSessionId = safeSessionId(request == null ? "" : request.guestSessionId());
        if (userId != GUEST_USER_ID || guestSessionId.isBlank()) {
            return new GuestSessionClearResponse(true, "没有需要清理的游客记录");
        }
        mapper.deleteGuestGoals(userId, guestSessionId);
        mapper.deleteGuestActions(userId, guestSessionId);
        int deleted = mapper.deleteGuestRecords(userId, guestSessionId);
        return new GuestSessionClearResponse(true, "已清理游客比赛记录 " + deleted + " 条");
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
