package com.footballbounce.server.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.footballbounce.server.dto.match.MatchRecordDtos.ReplayRequest;
import com.footballbounce.server.repository.MatchRecordMapper;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;

class MatchRecordServiceTest {

    @Test
    void findActionsQueryUsesPersistedMatchSecondOnly() throws Exception {
        Method method = MatchRecordMapper.class.getMethod("findActions", String.class);
        Select select = method.getAnnotation(Select.class);

        String sql = String.join("\n", select.value()).toLowerCase();

        assertThat(sql).contains("match_second as matchsecond");
        assertThat(sql).doesNotContain("timestampdiff");
        assertThat(sql).doesNotContain("created_at)");
        assertThat(sql).doesNotContain("greatest(");
    }

    @Test
    void awayReplayReturnsAlreadyMirroredActionsAndLineups() {
        MatchRecordMapper mapper = mock(MatchRecordMapper.class);
        MatchRecordService service = new MatchRecordService(mapper, new ObjectMapper());
        when(mapper.findOwnedFinishedRecord("m1", 2L, false, "")).thenReturn(awayRecord());
        when(mapper.findActions("m1")).thenReturn(List.of(canonicalHomeAction()));
        when(mapper.findPlayersByIds(anyList())).thenReturn(List.of(
                player("home-card", "Home Card"),
                player("away-card", "Away Card")
        ));

        var response = service.replay(new ReplayRequest("m1", 2L, ""));

        assertThat(response.ok()).isTrue();
        assertThat(response.mirrored()).isTrue();
        assertThat(response.record().homeFormationId()).isEqualTo("away-formation");
        assertThat(response.record().homeLineupPlayerIds()).isEqualTo("away-card");
        assertThat(response.homeLineup()).extracting("id").containsExactly("away-card");
        assertThat(response.actions()).hasSize(1);
        var action = response.actions().get(0);
        assertThat(action.matchSecond()).isEqualTo(4);
        assertThat(action.actorSide()).isEqualTo("away");
        assertThat(action.actorId()).isEqualTo("away-3");
        assertThat(action.commandJson()).contains("\"actorId\":\"away-3\"");
        assertThat(action.commandJson()).contains("\"side\":\"away\"");
    }

    private static Map<String, Object> awayRecord() {
        Map<String, Object> row = new HashMap<>();
        row.put("matchId", "m1");
        row.put("matchTime", "2026-06-29 12:00:00");
        row.put("matchType", "online");
        row.put("durationSeconds", 35);
        row.put("userId", 2L);
        row.put("username", "away-user");
        row.put("userSide", "away");
        row.put("opponentUserId", 1L);
        row.put("opponentUsername", "home-user");
        row.put("resultScore", "2 : 3");
        row.put("result", "lose");
        row.put("homeFormationId", "home-formation");
        row.put("awayFormationId", "away-formation");
        row.put("homeLineupPlayerIds", "home-card");
        row.put("awayLineupPlayerIds", "away-card");
        return row;
    }

    private static Map<String, Object> canonicalHomeAction() {
        return Map.of(
                "actionIndex", 1,
                "actorUserId", 1L,
                "actorSide", "home",
                "actorId", "home-3",
                "actionType", "action",
                "matchSecond", 4,
                "commandJson", "{\"commandId\":\"c1\",\"matchId\":\"m1\",\"actorId\":\"home-3\",\"side\":\"home\",\"angleRad\":0.5,\"power\":1.2}",
                "validResult", true,
                "validationMessage", "pending",
                "createdAt", "2026-06-29 12:00:30"
        );
    }

    private static Map<String, Object> player(String id, String name) {
        return Map.of(
                "id", id,
                "name", name,
                "score", 70,
                "rarity", "blue",
                "avatarSeed", 1,
                "power", 65,
                "accuracy", 65,
                "curve", 65
        );
    }
}
