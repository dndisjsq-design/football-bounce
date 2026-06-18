package com.footballbounce.server.dto;

public record ApiResponse<T>(
        boolean ok,
        String message,
        T data,
        UserSummaryDto userSummary
) {
    public static <T> ApiResponse<T> ok(String message, T data) {
        return new ApiResponse<>(true, message, data, null);
    }

    public static <T> ApiResponse<T> okWithUser(String message, T data, UserSummaryDto userSummary) {
        return new ApiResponse<>(true, message, data, userSummary);
    }

    public static <T> ApiResponse<T> fail(String message) {
        return new ApiResponse<>(false, message, null, null);
    }

    public static <T> ApiResponse<T> failWithUser(String message, UserSummaryDto userSummary) {
        return new ApiResponse<>(false, message, null, userSummary);
    }
}
