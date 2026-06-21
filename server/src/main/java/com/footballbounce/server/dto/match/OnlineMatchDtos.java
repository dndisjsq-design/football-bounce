package com.footballbounce.server.dto.match;

import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.PlayerPhysicsSummary;
import com.footballbounce.server.dto.match.SingleMatchDtos.ScoreDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SettlementDto;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotDto;
import java.util.List;

public final class OnlineMatchDtos {

    private OnlineMatchDtos() {
    }

    public record OnlinePlayerDto(
            Long userId,
            String username,
            String displayName,
            String avatarUrl
    ) {
    }

    public record JoinRequest(Long userId, String requestId, String guestSessionId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record StatusRequest(Long userId, String requestId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record CancelRequest(Long userId, String requestId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record SubmitShootRequest(
            Long userId,
            String requestId,
            String matchId,
            String commandId,
            String actorId,
            String side,
            Double angleRad,
            Double power,
            Double curveAngleRad,
            Double curveDistance,
            Double fieldWidth,
            Double fieldHeight,
            Long clientTick,
            String deviceId,
            String authToken,
            String clientInstanceId
    ) {
    }

    public record ActionPollRequest(Long userId, String requestId, String matchId, Long sinceSeq, Double fieldWidth, Double fieldHeight, String deviceId, String authToken, String clientInstanceId) {
    }

    public record ClockRequest(Long userId, String requestId, String matchId, Double fieldWidth, Double fieldHeight, String deviceId, String authToken, String clientInstanceId) {
    }

    public record SettlementRequest(Long userId, String requestId, String matchId, String guestSessionId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record SubmitResultRequest(
            Long userId,
            String requestId,
            String matchId,
            String commandId,
            SnapshotDto snapshot,
            String eventId,
            String eventType,
            Long eventTick,
            String eventSide,
            String eventActorId,
            Integer eventMatchSecond,
            Boolean eventPenalty,
            Boolean eventOwnGoal,
            ScoreDto eventScore,
            Double fieldWidth,
            Double fieldHeight,
            String deviceId,
            String authToken,
            String clientInstanceId
    ) {
    }

    public record OnlineClockDto(
            long serverTimeMillis,
            double matchRemainingSeconds,
            double turnRemainingSeconds,
            String turnNetworkSide,
            boolean controlEnabled
    ) {
    }

    public record ClockResponse(
            boolean ok,
            String message,
            OnlineClockDto clock,
            String winnerNetworkSide,
            String loserNetworkSide,
            ScoreDto finalScore
    ) {
    }

    public record OnlineShootCommandDto(
            String commandId,
            String matchId,
            String actorId,
            String side,
            double angleRad,
            double power,
            Double curveAngleRad,
            Double curveDistance,
            long clientTick
    ) {
    }

    public record OnlineActionDto(
            long seq,
            Long actorUserId,
            String actorRequestId,
            String actorNetworkSide,
            OnlineShootCommandDto command
    ) {
    }

    public record ActionResponse(
            boolean ok,
            String message,
            List<OnlineActionDto> actions,
            long nextSeq,
            OnlineClockDto clock,
            String winnerNetworkSide,
            String loserNetworkSide,
            ScoreDto finalScore
    ) {
    }

    public record ResultResponse(
            boolean ok,
            boolean valid,
            boolean confirmed,
            String message,
            OnlineClockDto clock,
            String winnerNetworkSide,
            String loserNetworkSide,
            ScoreDto finalScore,
            List<PlayerPhysicsSummary> homePhysics,
            List<PlayerPhysicsSummary> awayPhysics
    ) {
    }

    public record SettlementResponse(
            boolean ok,
            String message,
            SettlementDto settlement
    ) {
    }

    public record MatchmakingResponse(
            boolean ok,
            String message,
            String status,
            String requestId,
            String matchId,
            String selfSide,
            String initialTurn,
            OnlinePlayerDto leftPlayer,
            OnlinePlayerDto rightPlayer,
            OnlinePlayerDto homePlayer,
            OnlinePlayerDto awayPlayer,
            String homeFormationId,
            String awayFormationId,
            List<PlayerSummary> homeLineup,
            List<PlayerSummary> awayLineup,
            long matchedAtMillis,
            SnapshotDto snapshot
    ) {
    }
}
