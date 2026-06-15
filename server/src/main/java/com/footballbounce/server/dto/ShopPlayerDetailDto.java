package com.footballbounce.server.dto;

import com.footballbounce.server.domain.PlayerData;

public record ShopPlayerDetailDto(
        String id,
        String name,
        Integer score,
        String rarity,
        Integer avatarSeed,
        Integer price,
        String intro,
        String bodyType,
        String nationality,
        String club,
        Integer height,
        Integer weight,
        Integer age,
        String skills,
        Integer power,
        Integer accuracy,
        Integer curve,
        Integer stamina,
        Integer bodyStrength
) {
    public static ShopPlayerDetailDto from(PlayerData player) {
        return new ShopPlayerDetailDto(
                player.getPlayerId(),
                player.getName(),
                player.getScore(),
                player.getRarity(),
                player.getAvatarSeed(),
                priceOf(player),
                player.getIntro(),
                player.getBodyType(),
                player.getNationality(),
                player.getClub(),
                player.getHeight(),
                player.getWeight(),
                player.getAge(),
                player.getSkills(),
                player.getPower(),
                player.getAccuracy(),
                player.getCurve(),
                player.getStamina(),
                player.getBodyStrength()
        );
    }

    private static Integer priceOf(PlayerData player) {
        if (player.getScore() == null || player.getRarity() == null) return 0;
        return switch (player.getRarity()) {
            case "red" -> player.getScore() * 100;
            case "orange" -> player.getScore() * 10;
            case "purple" -> player.getScore();
            default -> player.getScore() / 10;
        };
    }
}
