package com.footballbounce.server.service;

import com.footballbounce.server.domain.UserLineup;
import com.footballbounce.server.dto.ApiResponse;
import com.footballbounce.server.dto.GuestResetRequest;
import com.footballbounce.server.repository.CoinTransactionMapper;
import com.footballbounce.server.repository.LineupMapper;
import com.footballbounce.server.repository.MatchRecordMapper;
import com.footballbounce.server.repository.UserMapper;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestAccountService {
    private static final long GUEST_USER_ID = 1L;
    private static final String DEFAULT_FORMATION_ID = "defense-311";
    private static final String DEFAULT_PLAYER_POLICY = "blue,purple";
    private static final List<String> DEFAULT_FORMATION_IDS = List.of(
            "balanced-221",
            "midfield-131",
            "defense-311",
            "attack-122",
            "diamond-212"
    );

    private final UserMapper userMapper;
    private final LineupMapper lineupMapper;
    private final CoinTransactionMapper coinTransactionMapper;
    private final MatchRecordMapper matchRecordMapper;

    public GuestAccountService(
            UserMapper userMapper,
            LineupMapper lineupMapper,
            CoinTransactionMapper coinTransactionMapper,
            MatchRecordMapper matchRecordMapper
    ) {
        this.userMapper = userMapper;
        this.lineupMapper = lineupMapper;
        this.coinTransactionMapper = coinTransactionMapper;
        this.matchRecordMapper = matchRecordMapper;
    }

    @Transactional
    public ApiResponse<Void> resetGuest(GuestResetRequest request) {
        long userId = request == null || request.userId() == null ? GUEST_USER_ID : request.userId();
        if (userId != GUEST_USER_ID) return ApiResponse.fail("只能重置游客账号");

        coinTransactionMapper.deleteByUserId(GUEST_USER_ID);
        matchRecordMapper.deleteAllGuestGoals(GUEST_USER_ID);
        matchRecordMapper.deleteAllGuestActions(GUEST_USER_ID);
        matchRecordMapper.deleteAllGuestRecords(GUEST_USER_ID);

        lineupMapper.deleteLineup(GUEST_USER_ID);
        lineupMapper.deleteOwnedPlayers(GUEST_USER_ID);
        lineupMapper.deleteOwnedFormations(GUEST_USER_ID);

        userMapper.resetGuestFromTemplate(GUEST_USER_ID);
        Map<String, Object> template = userMapper.findGuestTemplate();
        String playerPolicy = stringValue(template, "playerPolicy", DEFAULT_PLAYER_POLICY);
        String selectedFormationId = stringValue(template, "selectedFormationId", DEFAULT_FORMATION_ID);

        restoreOwnedPlayers(playerPolicy);
        for (int i = 0; i < DEFAULT_FORMATION_IDS.size(); i += 1) {
            lineupMapper.insertOwnedFormationIfAbsent(GUEST_USER_ID, DEFAULT_FORMATION_IDS.get(i), i);
        }
        restoreDefaultLineup(selectedFormationId);

        return ApiResponse.ok("游客账号已复原", null);
    }

    private void restoreOwnedPlayers(String playerPolicy) {
        String normalized = playerPolicy == null ? "" : playerPolicy.trim().toLowerCase(Locale.ROOT);
        if ("all".equals(normalized)) {
            lineupMapper.insertOwnedAllPlayers(GUEST_USER_ID);
            return;
        }
        for (String rarity : normalized.split(",")) {
            String value = rarity.trim();
            if (!value.isEmpty()) lineupMapper.insertOwnedPlayersByRarity(GUEST_USER_ID, value);
        }
    }

    private void restoreDefaultLineup(String selectedFormationId) {
        List<String> playerIds = lineupMapper.findTopOwnedPlayerIds(GUEST_USER_ID, 5);
        if (playerIds.size() < 5) return;
        UserLineup lineup = new UserLineup();
        lineup.setUserId(GUEST_USER_ID);
        lineup.setSelectedFormationId(selectedFormationId == null || selectedFormationId.isBlank() ? DEFAULT_FORMATION_ID : selectedFormationId.trim());
        lineup.setSlot1PlayerId(playerIds.get(0));
        lineup.setSlot2PlayerId(playerIds.get(1));
        lineup.setSlot3PlayerId(playerIds.get(2));
        lineup.setSlot4PlayerId(playerIds.get(3));
        lineup.setSlot5PlayerId(playerIds.get(4));
        lineupMapper.upsertLineup(lineup);
    }

    private String stringValue(Map<String, Object> row, String key, String fallback) {
        if (row == null) return fallback;
        Object value = row.get(key);
        if (value == null) return fallback;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? fallback : text;
    }
}
