package com.footballbounce.server.dto;

import com.footballbounce.server.domain.UserAccount;

public record UserDto(Long id, String username, String displayName, Integer coins) {

    public static UserDto from(UserAccount user) {
        return new UserDto(user.getId(), user.getUsername(), user.getDisplayName(), user.getCoins());
    }
}
