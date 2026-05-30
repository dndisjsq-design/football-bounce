package com.footballbounce.server.dto;

import java.util.List;

public record LineupStateResponse(
        Long userId,
        String selectedFormationId,
        List<String> formationIds,
        List<String> lineupPlayerIds,
        List<LineupPlayerDto> players
) {
}
