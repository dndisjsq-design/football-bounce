package com.footballbounce.server.service;

import com.footballbounce.server.domain.PlayerData;
import com.footballbounce.server.domain.UserLineup;
import com.footballbounce.server.dto.LineupPlayerDto;
import com.footballbounce.server.dto.LineupSaveRequest;
import com.footballbounce.server.dto.LineupStateResponse;
import com.footballbounce.server.repository.LineupMapper;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LineupService {
    private static final List<String> DEFAULT_FORMATION_IDS = List.of("balanced-221", "midfield-131", "defense-311", "attack-122", "diamond-212");

    private final LineupMapper lineupMapper;

    public LineupService(LineupMapper lineupMapper) {
        this.lineupMapper = lineupMapper;
    }

    @Transactional
    public LineupStateResponse getState(Long userId) {
        return buildState(userId);
    }

    @Transactional
    public LineupStateResponse saveState(LineupSaveRequest request) {
        UserLineup lineup = new UserLineup();
        lineup.setUserId(request.getUserId());
        lineup.setSelectedFormationId(normalizeFormationId(request.getSelectedFormationId()));
        List<String> playerIds = normalizeLineupPlayerIds(request.getLineupPlayerIds());
        lineup.setSlot1PlayerId(playerIds.get(0));
        lineup.setSlot2PlayerId(playerIds.get(1));
        lineup.setSlot3PlayerId(playerIds.get(2));
        lineup.setSlot4PlayerId(playerIds.get(3));
        lineup.setSlot5PlayerId(playerIds.get(4));
        lineupMapper.upsertLineup(lineup);
        return buildState(request.getUserId());
    }

    @Transactional
    public void initializeNewUserDefaults(Long userId) {
        if (userId == null) return;
        lineupMapper.insertOwnedPlayersByRarity(userId, "blue");
        for (int i = 0; i < DEFAULT_FORMATION_IDS.size(); i += 1) lineupMapper.insertOwnedFormationIfAbsent(userId, DEFAULT_FORMATION_IDS.get(i), i);
        List<String> playerIds = lineupMapper.findTopOwnedPlayerIds(userId, 5);
        if (playerIds.size() >= 5) {
            UserLineup lineup = new UserLineup();
            lineup.setUserId(userId);
            lineup.setSelectedFormationId("defense-311");
            lineup.setSlot1PlayerId(playerIds.get(0));
            lineup.setSlot2PlayerId(playerIds.get(1));
            lineup.setSlot3PlayerId(playerIds.get(2));
            lineup.setSlot4PlayerId(playerIds.get(3));
            lineup.setSlot5PlayerId(playerIds.get(4));
            lineupMapper.upsertLineup(lineup);
        }
    }

    private LineupStateResponse buildState(Long userId) {
        UserLineup lineup = lineupMapper.findLineup(userId);
        List<PlayerData> players = lineupMapper.findOwnedPlayers(userId);
        List<String> formationIds = lineupMapper.findOwnedFormationIds(userId);
        return new LineupStateResponse(
                userId,
                lineup == null ? "" : lineup.getSelectedFormationId(),
                formationIds,
                lineup == null ? List.of() : lineupPlayerIds(lineup),
                players.stream().map(LineupPlayerDto::from).toList()
        );
    }

    private String normalizeFormationId(String formationId) {
        return formationId == null ? "" : formationId.trim();
    }

    private List<String> normalizeLineupPlayerIds(List<String> incoming) {
        List<String> normalized = new ArrayList<>();
        if (incoming != null) {
            for (String playerId : incoming) {
                if (playerId != null && !playerId.isBlank()) normalized.add(playerId.trim());
                if (normalized.size() >= 5) break;
            }
        }
        if (normalized.size() < 5) {
            throw new IllegalArgumentException("阵容必须包含 5 个后端已存在的球员");
        }
        return normalized;
    }

    private List<String> lineupPlayerIds(UserLineup lineup) {
        return Arrays.asList(lineup.getSlot1PlayerId(), lineup.getSlot2PlayerId(), lineup.getSlot3PlayerId(), lineup.getSlot4PlayerId(), lineup.getSlot5PlayerId());
    }
}
