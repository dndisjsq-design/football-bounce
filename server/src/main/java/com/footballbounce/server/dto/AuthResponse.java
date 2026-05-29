package com.footballbounce.server.dto;

public record AuthResponse(
        AuthCode code,
        String message,
        UserDto user,
        String authToken,
        String expiresAt
) {

    public static AuthResponse success(String message, UserDto user) {
        return new AuthResponse(AuthCode.SUCCESS, message, user, null, null);
    }

    public static AuthResponse successWithToken(String message, UserDto user, String authToken, String expiresAt) {
        return new AuthResponse(AuthCode.SUCCESS, message, user, authToken, expiresAt);
    }

    public static AuthResponse fail(AuthCode code, String message) {
        return new AuthResponse(code, message, null, null, null);
    }
}
