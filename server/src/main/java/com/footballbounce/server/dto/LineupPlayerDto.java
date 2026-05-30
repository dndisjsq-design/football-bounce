package com.footballbounce.server.dto;

import com.footballbounce.server.domain.PlayerData;

public record LineupPlayerDto(String id, String name, Integer score, String rarity, Integer avatarSeed) {
    public static LineupPlayerDto from(PlayerData player) {
        return new LineupPlayerDto(player.getPlayerId(), player.getName(), player.getScore(), player.getRarity(), player.getAvatarSeed());
    }
}
