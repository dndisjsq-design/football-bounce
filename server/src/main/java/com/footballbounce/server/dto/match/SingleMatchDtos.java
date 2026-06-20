package com.footballbounce.server.dto.match;

import com.footballbounce.server.dto.UserSummaryDto;
import java.util.List;

public final class SingleMatchDtos {

    private SingleMatchDtos() {
    }

    public record StartRequest(Long userId, String clientSessionId, Double fieldWidth, Double fieldHeight) {
    }

    public record PlayerSummary(
            String id,
            String name,
            int score,
            String rarity,
            int avatarSeed
    ) {
    }

    public record BodyDto(
            String id,
            String kind,
            String side,
            double x,
            double y,
            double vx,
            double vy,
            double radius,
            double mass,
            double friction,
            double restitution
    ) {
    }

    public record ScoreDto(int home, int away) {
    }

    public record SnapshotDto(
            String matchId,
            String mode,
            Double fieldWidth,
            Double fieldHeight,
            long tick,
            String turn,
            ScoreDto score,
            List<BodyDto> players,
            BodyDto ball
    ) {
    }

    public record ShootCommandDto(
            String commandId,
            String matchId,
            String actorId,
            String side,
            double angleRad,
            double power,
            Double curveAngleRad,
            Double curveDistance,
            Double fieldWidth,
            Double fieldHeight,
            Long clientTick
    ) {
    }

    public record StartResponse(
            boolean ok,
            String message,
            String matchId,
            Long userId,
            String username,
            String homeFormationId,
            String awayFormationId,
            List<PlayerSummary> homeLineup,
            List<PlayerSummary> awayLineup,
            SnapshotDto snapshot
    ) {
    }

    public record ShootRequest(String matchId, ShootCommandDto command) {
    }

    public record ShootResponse(boolean ok, String message, SnapshotDto expectedSnapshot) {
    }

    public record AiShootRequest(String matchId, String phase, String actorId, Double actorX, Double actorY) {
    }

    public record AiShootResponse(boolean ok, String message, ShootCommandDto command, SnapshotDto expectedSnapshot) {
    }

    public record AiKeeperRequest(String matchId) {
    }

    public record AiKeeperResponse(boolean ok, String message, int direction) {
    }

    public record SnapshotValidationRequest(String matchId, String phase, SnapshotDto snapshot) {
    }

    public record SnapshotValidationResponse(
            boolean ok,
            boolean valid,
            String message,
            SnapshotDto expectedSnapshot
    ) {
    }

    public record MatchEventRequest(
            String matchId,
            String eventId,
            String type,
            Long tick,
            String side,
            String actorId,
            Integer matchSecond,
            Boolean penalty,
            Boolean ownGoal,
            ScoreDto score,
            Long clientTick
    ) {
    }

    public record MatchEventResponse(boolean ok, String message) {
    }

    public record FinishRequest(
            String matchId,
            Integer durationSeconds,
            ScoreDto score,
            String result,
            String resultScore
    ) {
    }

    public record SettlementGoalDto(
            int matchSecond,
            boolean penalty,
            long userId,
            String username,
            String side,
            String actorId,
            String playerId,
            String playerName,
            boolean ownGoal,
            int order
    ) {
    }

    public record BestPlayerDto(
            long userId,
            String username,
            String side,
            String actorId,
            String playerId,
            String playerName,
            int goals
    ) {
    }

    public record SettlementDto(
            String matchId,
            String result,
            String scoreText,
            String winnerSide,
            BestPlayerDto bestPlayer,
            List<SettlementGoalDto> goals
    ) {
    }

    public record FinishResponse(boolean ok, String message, SettlementDto settlement, UserSummaryDto userSummary) {
    }

    public record AbandonRequest(String matchId, Long userId) {
    }

    public record AbandonResponse(boolean ok, String message) {
    }
}
