package com.footballbounce.server.dto;

public record GuestResetRequest(Long userId, String guestSessionId) {
}
