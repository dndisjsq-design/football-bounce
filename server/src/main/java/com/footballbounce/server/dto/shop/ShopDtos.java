package com.footballbounce.server.dto.shop;

import com.footballbounce.server.dto.LineupPlayerDto;
import java.util.List;

public final class ShopDtos {
    private ShopDtos() {
    }

    public record PurchasePlayerRequest(Long userId, String playerId) {
    }

    public record PurchaseFormationRequest(Long userId, String formationId) {
    }

    public record DrawPackRequest(Long userId, String packId, Integer count) {
    }

    public record PurchaseResult(String itemId, Integer price) {
    }

    public record DrawPackResult(String packId, Integer count, Integer price, List<LineupPlayerDto> players) {
    }
}
