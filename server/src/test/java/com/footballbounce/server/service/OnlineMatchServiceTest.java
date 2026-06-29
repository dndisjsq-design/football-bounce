package com.footballbounce.server.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.footballbounce.server.domain.UserLoginSession;
import com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.JoinRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.MatchmakingResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OpponentActionRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ReadyRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ScoreRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SubmitShootRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.TurnRequest;
import com.footballbounce.server.repository.SingleMatchMapper;
import com.footballbounce.server.repository.UserLoginSessionMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class OnlineMatchServiceTest {

    private OnlineMatchService service;
    private TestStore activeStore;
    private final Map<String, Long> lastSeqByRequestId = new HashMap<>();

    @AfterEach
    void stopService() {
        if (service != null) service.stopRuntimeLoop();
    }

    @Test
    void onlineMatchContinuesAfterGoalsUntilOneSideWins() throws Exception {
        SingleMatchMapper mapper = mock(SingleMatchMapper.class);
        UserLoginSessionMapper sessionMapper = mock(UserLoginSessionMapper.class);
        MatchRewardService rewardService = mock(MatchRewardService.class);
        TestStore store = new TestStore();
        activeStore = store;

        stubMapper(mapper, store);
        stubSession(sessionMapper, 2L);

        service = new OnlineMatchService(mapper, sessionMapper, rewardService);
        service.startRuntimeLoop();

        String homeRequestId = "home-request";
        String awayRequestId = "away-request";
        MatchmakingResponse waiting = service.join(new JoinRequest(1L, homeRequestId, "guest-session", "", "", "home-instance"));
        assertEquals("WAITING", waiting.status());
        MatchmakingResponse awayMatched = service.join(new JoinRequest(2L, awayRequestId, "", "away-device", "away-token", "away-instance"));
        assertEquals("MATCHED", awayMatched.status());
        MatchmakingResponse homeMatched = service.status(new com.footballbounce.server.dto.match.OnlineMatchDtos.StatusRequest(1L, homeRequestId, "", "", "home-instance"));
        assertEquals("MATCHED", homeMatched.status());
        String matchId = homeMatched.matchId();
        assertNotNull(matchId);

        CompletableFuture<?> homeReady = CompletableFuture.runAsync(() -> {
            var response = service.ready(new ReadyRequest(1L, homeRequestId, matchId, 362.0, 650.0, "", "", "home-instance"));
            assertTrue(response.ok());
            assertTrue(response.started());
        });
        CompletableFuture<?> awayReady = CompletableFuture.runAsync(() -> {
            var response = service.ready(new ReadyRequest(2L, awayRequestId, matchId, 362.0, 650.0, "away-device", "away-token", "away-instance"));
            assertTrue(response.ok());
            assertTrue(response.started());
        });
        CompletableFuture.allOf(homeReady, awayReady).get(12, TimeUnit.SECONDS);

        var initialTurn = service.turnRequest(turn(1L, homeRequestId, matchId, "", "", "home-instance"));
        assertTrue(initialTurn.canControl());
        assertTrue(initialTurn.homePhysics().stream().anyMatch(profile -> "home-5".equals(profile.actorId()) && profile.shotPowerScale() > 10), initialTurn.homePhysics().toString());
        assertTrue(String.valueOf(runtimeSnapshot(matchId)).contains("id=home-5, kind=player, side=home, x=0.0, y=-52.0"), String.valueOf(runtimeSnapshot(matchId)));
        assertFalse(service.turnRequest(turn(2L, awayRequestId, matchId, "away-device", "away-token", "away-instance")).canControl());
        assertTrue(String.valueOf(runtimeSnapshot(matchId)).contains("id=home-5, kind=player, side=home, x=0.0, y=-52.0"), String.valueOf(runtimeSnapshot(matchId)));
        assertTrue(service.pollOpponentAction(actionRequest(2L, awayRequestId, matchId, 0, "away-device", "away-token", "away-instance")).actions().isEmpty());

        shootPollAndWaitScore(1L, homeRequestId, "", "", "home-instance", 2L, awayRequestId, "away-device", "away-token", "away-instance", matchId, "home-1", 1.5, Map.of("home", 1, "away", 0));
        assertTrue(service.turnRequest(turn(2L, awayRequestId, matchId, "away-device", "away-token", "away-instance")).canControl());

        shootPollAndWaitScore(2L, awayRequestId, "away-device", "away-token", "away-instance", 1L, homeRequestId, "", "", "home-instance", matchId, "away-1", 1.5, Map.of("home", 1, "away", 1));
        assertTrue(service.turnRequest(turn(1L, homeRequestId, matchId, "", "", "home-instance")).canControl());

        shootPollAndWaitScore(1L, homeRequestId, "", "", "home-instance", 2L, awayRequestId, "away-device", "away-token", "away-instance", matchId, "home-2", 1.5, Map.of("home", 2, "away", 1));
        assertTrue(service.turnRequest(turn(2L, awayRequestId, matchId, "away-device", "away-token", "away-instance")).canControl());

        shootPollAndWaitScore(2L, awayRequestId, "away-device", "away-token", "away-instance", 1L, homeRequestId, "", "", "home-instance", matchId, "away-2", 1.5, Map.of("home", 2, "away", 2));
        assertTrue(service.turnRequest(turn(1L, homeRequestId, matchId, "", "", "home-instance")).canControl());

        shootPollAndWaitScore(1L, homeRequestId, "", "", "home-instance", 2L, awayRequestId, "away-device", "away-token", "away-instance", matchId, "home-3", 1.5, Map.of("home", 3, "away", 2));

        var finish = waitFinish(1L, homeRequestId, matchId, "guest-session", "", "", "home-instance");
        assertTrue(finish.canEnd(), finish + " snapshot=" + runtimeSnapshot(matchId) + " actions=" + store.actions);
        assertNotNull(finish.settlement());
        assertEquals("win", finish.settlement().result());
        assertEquals("3 : 2", finish.settlement().scoreText());
        assertEquals(5, store.goals.size());
        assertEquals("end", store.actions.get(store.actions.size() - 1).get("actionType"));
    }

    private void shootPollAndWaitScore(
            long userId,
            String requestId,
            String deviceId,
            String authToken,
            String clientInstanceId,
            long receiverUserId,
            String receiverRequestId,
            String receiverDeviceId,
            String receiverAuthToken,
            String receiverClientInstanceId,
            String matchId,
            String commandId,
            double power,
            Map<String, Integer> expected
    ) throws InterruptedException {
        var response = service.submitShoot(new SubmitShootRequest(
                userId,
                requestId,
                matchId,
                commandId,
                "home-5",
                "home",
                Math.toRadians(82.0),
                power,
                0.0,
                0.0,
                false,
                362.0,
                650.0,
                System.currentTimeMillis(),
                deviceId,
                authToken,
                clientInstanceId
        ));
        assertTrue(response.ok(), response.message());
        long sinceSeq = lastSeqByRequestId.getOrDefault(receiverRequestId, 0L);
        var action = waitOpponentAction(receiverUserId, receiverRequestId, matchId, sinceSeq, receiverDeviceId, receiverAuthToken, receiverClientInstanceId);
        lastSeqByRequestId.put(receiverRequestId, action.nextSeq());
        assertEquals(1, action.actions().size(), action.message());
        assertEquals(commandId, action.actions().get(0).command().commandId());
        waitScore(userId, requestId, matchId, deviceId, authToken, clientInstanceId, expected);
    }

    private com.footballbounce.server.dto.match.OnlineMatchDtos.ActionResponse waitOpponentAction(long userId, String requestId, String matchId, long sinceSeq, String deviceId, String authToken, String clientInstanceId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000L;
        while (System.currentTimeMillis() < deadline) {
            var response = service.pollOpponentAction(actionRequest(userId, requestId, matchId, sinceSeq, deviceId, authToken, clientInstanceId));
            if (response.actions() != null && !response.actions().isEmpty()) return response;
            Thread.sleep(40L);
        }
        return service.pollOpponentAction(actionRequest(userId, requestId, matchId, sinceSeq, deviceId, authToken, clientInstanceId));
    }

    private void waitScore(long userId, String requestId, String matchId, String deviceId, String authToken, String clientInstanceId, Map<String, Integer> expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 12_000L;
        while (System.currentTimeMillis() < deadline) {
            var score = service.score(new ScoreRequest(userId, requestId, matchId, deviceId, authToken, clientInstanceId)).score();
            if (score != null && score.home() == expected.get("home") && score.away() == expected.get("away")) return;
            Thread.sleep(40L);
        }
        var score = service.score(new ScoreRequest(userId, requestId, matchId, deviceId, authToken, clientInstanceId)).score();
        throw new AssertionError("Timed out waiting for score " + expected + ", last=" + score + ", actions=" + currentStoreActions() + ", snapshot=" + runtimeSnapshot(matchId));
    }

    private List<Map<String, Object>> currentStoreActions() {
        return activeStore == null ? List.of() : activeStore.actions;
    }

    private Object runtimeSnapshot(String matchId) {
        try {
            Field matchesField = OnlineMatchService.class.getDeclaredField("runtimeMatches");
            matchesField.setAccessible(true);
            Map<?, ?> matches = (Map<?, ?>) matchesField.get(service);
            Object match = matches.get(matchId);
            Field stateField = match.getClass().getDeclaredField("serverState");
            stateField.setAccessible(true);
            Object state = stateField.get(match);
            Method snapshot = state.getClass().getDeclaredMethod("snapshot");
            snapshot.setAccessible(true);
            return snapshot.invoke(state);
        } catch (Exception ex) {
            return ex.toString();
        }
    }

    private com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckResponse waitFinish(long userId, String requestId, String matchId, String guestSessionId, String deviceId, String authToken, String clientInstanceId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 8_000L;
        while (System.currentTimeMillis() < deadline) {
            var finish = service.finishCheck(new FinishCheckRequest(userId, requestId, matchId, guestSessionId, deviceId, authToken, clientInstanceId));
            if (finish.canEnd()) return finish;
            Thread.sleep(40L);
        }
        return service.finishCheck(new FinishCheckRequest(userId, requestId, matchId, guestSessionId, deviceId, authToken, clientInstanceId));
    }

    private TurnRequest turn(long userId, String requestId, String matchId, String deviceId, String authToken, String clientInstanceId) {
        return new TurnRequest(userId, requestId, matchId, 362.0, 650.0, deviceId, authToken, clientInstanceId);
    }

    private OpponentActionRequest actionRequest(long userId, String requestId, String matchId, long sinceSeq, String deviceId, String authToken, String clientInstanceId) {
        return new OpponentActionRequest(userId, requestId, matchId, sinceSeq, 362.0, 650.0, deviceId, authToken, clientInstanceId);
    }

    private void stubMapper(SingleMatchMapper mapper, TestStore store) {
        when(mapper.findUser(1L)).thenReturn(user(1L, "visiter"));
        when(mapper.findUser(2L)).thenReturn(user(2L, "opponent"));
        when(mapper.findUserLineup(anyLong())).thenReturn(lineup());
        when(mapper.findPlayersByIds(anyList())).thenReturn(players());
        when(mapper.insertMatchRecord(anyString(), anyLong(), anyString(), anyString(), any(), anyString(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString())).thenAnswer(invocation -> {
            Map<String, Object> record = new HashMap<>();
            record.put("matchId", invocation.getArgument(0));
            record.put("userId", invocation.getArgument(1));
            record.put("username", invocation.getArgument(2));
            record.put("userSide", invocation.getArgument(3));
            record.put("matchType", "online");
            record.put("durationSeconds", 0);
            record.put("opponentUserId", invocation.getArgument(6));
            record.put("opponentUsername", invocation.getArgument(7));
            record.put("homeFormationId", invocation.getArgument(8));
            record.put("awayFormationId", invocation.getArgument(9));
            record.put("homeLineupPlayerIds", invocation.getArgument(10));
            record.put("awayLineupPlayerIds", invocation.getArgument(11));
            store.records.put(invocation.getArgument(0) + ":" + invocation.getArgument(1), record);
            return 1;
        });
        when(mapper.insertAction(anyString(), anyInt(), anyLong(), anyString(), any(), anyString(), anyInt(), any(), any(), any())).thenAnswer(invocation -> {
            Map<String, Object> action = new HashMap<>();
            action.put("matchNo", invocation.getArgument(0));
            action.put("actionIndex", invocation.getArgument(1));
            action.put("actorUserId", invocation.getArgument(2));
            action.put("actorSide", invocation.getArgument(3));
            action.put("actorId", invocation.getArgument(4));
            action.put("actionType", invocation.getArgument(5));
            action.put("commandJson", invocation.getArgument(7));
            store.actions.add(action);
            return 1;
        });
        when(mapper.insertGoal(anyString(), anyInt(), anyInt(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString(), anyBoolean(), anyBoolean())).thenAnswer(invocation -> {
            Map<String, Object> goal = new HashMap<>();
            goal.put("matchSecond", invocation.getArgument(2));
            goal.put("penalty", invocation.getArgument(9));
            goal.put("userId", invocation.getArgument(3));
            goal.put("username", invocation.getArgument(4));
            goal.put("side", invocation.getArgument(5));
            goal.put("actorId", invocation.getArgument(6));
            goal.put("playerId", invocation.getArgument(7));
            goal.put("playerName", invocation.getArgument(8));
            goal.put("ownGoal", invocation.getArgument(10));
            goal.put("goalOrder", invocation.getArgument(1));
            store.goals.add(goal);
            return 1;
        });
        when(mapper.finishMatch(anyString(), anyLong(), anyInt(), anyString(), anyString())).thenAnswer(invocation -> {
            Map<String, Object> record = store.records.get(invocation.getArgument(0) + ":" + invocation.getArgument(1));
            if (record != null) {
                record.put("durationSeconds", invocation.getArgument(2));
                record.put("resultScore", invocation.getArgument(3));
                record.put("result", invocation.getArgument(4));
            }
            return 1;
        });
        when(mapper.findOnlineFinishedRecord(anyString(), anyLong(), anyBoolean(), anyString())).thenAnswer(invocation -> store.records.get(invocation.getArgument(0) + ":" + invocation.getArgument(1)));
        when(mapper.findGoalsByMatchNo(anyString())).thenAnswer(invocation -> store.goals);
    }

    private void stubSession(UserLoginSessionMapper sessionMapper, long userId) {
        UserLoginSession session = new UserLoginSession();
        session.setId(99L);
        session.setUserId(userId);
        session.setExpiresAt(LocalDateTime.now().plusDays(1));
        when(sessionMapper.findActiveForInstance(anyString(), anyString(), eq("away-instance"))).thenReturn(session);
    }

    private Map<String, Object> user(Long id, String name) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", id);
        row.put("username", name);
        row.put("displayName", name);
        row.put("avatarUrl", "");
        return row;
    }

    private Map<String, Object> lineup() {
        Map<String, Object> row = new HashMap<>();
        row.put("selectedFormationId", "defense-311");
        row.put("slot1PlayerId", "blue-1");
        row.put("slot2PlayerId", "blue-2");
        row.put("slot3PlayerId", "blue-3");
        row.put("slot4PlayerId", "blue-4");
        row.put("slot5PlayerId", "red-20");
        return row;
    }

    private List<Map<String, Object>> players() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 1; i <= 4; i += 1) {
            rows.add(player("blue-" + i, "蓝" + i, 65, "blue", 65, 65, 65));
        }
        rows.add(player("red-20", "测试射手", 99, "red", 220, 100, 100));
        return rows;
    }

    private Map<String, Object> player(String id, String name, int score, String rarity, int power, int accuracy, int curve) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", id);
        row.put("name", name);
        row.put("score", score);
        row.put("rarity", rarity);
        row.put("avatarSeed", 1);
        row.put("power", power);
        row.put("accuracy", accuracy);
        row.put("curve", curve);
        return row;
    }

    private static final class TestStore {
        private final Map<String, Map<String, Object>> records = new HashMap<>();
        private final List<Map<String, Object>> goals = new ArrayList<>();
        private final List<Map<String, Object>> actions = new ArrayList<>();
    }

}
