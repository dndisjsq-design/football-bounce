package com.footballbounce.server.dto;

import com.footballbounce.server.domain.UserAccount;

public record UserSummaryDto(
        Long id,
        String username,
        String displayName,
        String avatarUrl,
        Integer coins,
        Integer singleTotalMatches,
        Integer singleWinMatches,
        Integer onlineTotalMatches,
        Integer onlineWinMatches
) {
    public static UserSummaryDto from(UserAccount user) {
        if (user == null) return null;
        return new UserSummaryDto(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getAvatarUrl(),
                user.getCoins(),
                user.getSingleTotalMatches(),
                user.getSingleWinMatches(),
                user.getOnlineTotalMatches(),
                user.getOnlineWinMatches()
        );
    }
}
