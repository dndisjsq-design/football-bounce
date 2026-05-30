package com.footballbounce.server.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

@Component
public class ApiRequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(ApiRequestLoggingFilter.class);
    private static final int MAX_LOG_BODY_LENGTH = 2000;
    private static final Set<String> SENSITIVE_QUERY_KEYS = Set.of("password", "token", "authtoken", "deviceid");
    private static final Pattern SENSITIVE_JSON_FIELD = Pattern.compile(
            "(?i)(\"(?:password|authToken|token|deviceId)\"\\s*:\\s*\")([^\"]*)(\")"
    );

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        ContentCachingRequestWrapper cachedRequest = new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper cachedResponse = new ContentCachingResponseWrapper(response);
        long startNanos = System.nanoTime();
        try {
            filterChain.doFilter(cachedRequest, cachedResponse);
        } finally {
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
            String requestBody = bodyToString(cachedRequest.getContentAsByteArray());
            String responseBody = bodyToString(cachedResponse.getContentAsByteArray());
            log.info(
                    "[API] {} {}{} body={} -> {} {}ms response={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    sanitizeQuery(request.getQueryString()),
                    sanitizeBody(requestBody),
                    cachedResponse.getStatus(),
                    elapsedMs,
                    sanitizeBody(responseBody)
            );
            cachedResponse.copyBodyToResponse();
        }
    }

    private String sanitizeQuery(String query) {
        if (query == null || query.isBlank()) return "";
        StringBuilder sanitized = new StringBuilder("?");
        String[] parts = query.split("&");
        for (int i = 0; i < parts.length; i += 1) {
            if (i > 0) sanitized.append('&');
            String part = parts[i];
            int equalsIndex = part.indexOf('=');
            String key = equalsIndex >= 0 ? part.substring(0, equalsIndex) : part;
            sanitized.append(key);
            if (equalsIndex >= 0) {
                sanitized.append('=');
                sanitized.append(SENSITIVE_QUERY_KEYS.contains(key.toLowerCase()) ? "***" : part.substring(equalsIndex + 1));
            }
        }
        return sanitized.toString();
    }

    private String bodyToString(byte[] bytes) {
        if (bytes.length == 0) return "";
        String value = new String(bytes, StandardCharsets.UTF_8).replace('\n', ' ').replace('\r', ' ').trim();
        if (value.length() <= MAX_LOG_BODY_LENGTH) return value;
        return value.substring(0, MAX_LOG_BODY_LENGTH) + "...";
    }

    private String sanitizeBody(String body) {
        if (body.isBlank()) return "-";
        return SENSITIVE_JSON_FIELD.matcher(body).replaceAll("$1***$3");
    }
}
