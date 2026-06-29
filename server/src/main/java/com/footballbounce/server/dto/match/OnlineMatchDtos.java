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
            Boolean noop,
            Double fieldWidth,
            Double fieldHeight,
            Long clientTick,
            String deviceId,
            String authToken,
            String clientInstanceId
    ) {
    }

    public record ClockRequest(Long userId, String requestId, String matchId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record ReadyRequest(Long userId, String requestId, String matchId, Double fieldWidth, Double fieldHeight, String deviceId, String authToken, String clientInstanceId) {
    }

    public record TurnRequest(Long userId, String requestId, String matchId, Double fieldWidth, Double fieldHeight, String deviceId, String authToken, String clientInstanceId) {
    }

    public record OpponentActionRequest(Long userId, String requestId, String matchId, Long sinceSeq, Double fieldWidth, Double fieldHeight, String deviceId, String authToken, String clientInstanceId) {
    }

    public record ScoreRequest(Long userId, String requestId, String matchId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record FinishCheckRequest(Long userId, String requestId, String matchId, String guestSessionId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record SettlementRequest(Long userId, String requestId, String matchId, String guestSessionId, String deviceId, String authToken, String clientInstanceId) {
    }

    public record OnlineClockDto(
            long serverTimeMillis,
            double matchRemainingSeconds,
            double turnRemainingSeconds,
            boolean paused,
            String pauseReason
    ) {
    }

    public record ClockResponse(
            boolean ok,
            String message,
            OnlineClockDto clock
    ) {
    }

    public record SkillTriggerDto(
            String actorId,
            String skillId,
            String name
    ) {
    }

    public record ReadyResponse(
            boolean ok,
            String message,
            boolean started,
            OnlineClockDto clock,
            SnapshotDto snapshot
    ) {
    }

    public record TurnResponse(
            boolean ok,
            String message,
            boolean canControl,
            OnlineClockDto clock,
            List<PlayerPhysicsSummary> homePhysics,
            List<PlayerPhysicsSummary> awayPhysics,
            List<SkillTriggerDto> skillTriggers
    ) {
    }

    public record ScoreResponse(
            boolean ok,
            String message,
            ScoreDto score
    ) {
    }

    public record FinishCheckResponse(
            boolean ok,
            String message,
            boolean canEnd,
            SettlementDto settlement
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
            Boolean noop,
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
            OnlineClockDto clock
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
