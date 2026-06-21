package com.footballbounce.server.dto.match;

import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementDto;
import java.util.List;

public final class MatchRecordDtos {

    private MatchRecordDtos() {
    }

    public record RecentRequest(Long userId, String guestSessionId, Integer limit, Integer offset) {
    }

    public record MatchRecordSummary(
            String matchId,
            String matchTime,
            String matchType,
            int durationSeconds,
            long userId,
            String username,
            String userSide,
            Long opponentUserId,
            String opponentUsername,
            String resultScore,
            String result,
            String homeFormationId,
            String awayFormationId,
            String homeLineupPlayerIds,
            String awayLineupPlayerIds
    ) {
    }

    public record RecentResponse(boolean ok, String message, List<MatchRecordSummary> records) {
    }

    public record ReplayRequest(String matchId, Long userId, String guestSessionId) {
    }

    public record MatchActionDto(
            int actionIndex,
            long actorUserId,
            String actorSide,
            String actorId,
            String actionType,
            int matchSecond,
            String commandJson,
            Boolean validResult,
            String validationMessage,
            String createdAt
    ) {
    }

    public record ReplayResponse(
            boolean ok,
            String message,
            MatchRecordSummary record,
            boolean mirrored,
            List<PlayerSummary> homeLineup,
            List<PlayerSummary> awayLineup,
            List<MatchActionDto> actions
    ) {
    }

    public record SettlementResponse(
            boolean ok,
            String message,
            SettlementDto settlement
    ) {
    }

    public record GuestSessionClearRequest(Long userId, String guestSessionId) {
    }

    public record GuestSessionClearResponse(boolean ok, String message) {
    }
}
