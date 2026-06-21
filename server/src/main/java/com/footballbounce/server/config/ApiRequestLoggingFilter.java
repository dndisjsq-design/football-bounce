package com.footballbounce.server.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.footballbounce.server.service.ApiMessageLogService;
import com.footballbounce.server.service.ApiMessageLogService.ApiMessageLogEntry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;
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
    private static final ZoneId LOG_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int MAX_CONSOLE_BODY_LENGTH = 2000;
    private static final int MAX_STORED_BODY_LENGTH = 12_000;
    private static final Set<String> SENSITIVE_QUERY_KEYS = Set.of("password", "passwordhash", "token", "authtoken", "deviceid", "clientinstanceid");
    private static final Pattern SENSITIVE_JSON_FIELD = Pattern.compile(
            "(?i)(\"(?:password|passwordHash|authToken|token|deviceId|clientInstanceId)\"\\s*:\\s*\")([^\"]*)(\")"
    );

    private final ApiMessageLogService apiMessageLogService;
    private final ObjectMapper objectMapper;

    public ApiRequestLoggingFilter(ApiMessageLogService apiMessageLogService, ObjectMapper objectMapper) {
        this.apiMessageLogService = apiMessageLogService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        ContentCachingRequestWrapper cachedRequest = new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper cachedResponse = new ContentCachingResponseWrapper(response);
        String traceId = request.getHeader("X-Request-Id");
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }
        LocalDateTime requestLoggedAt = LocalDateTime.now(LOG_ZONE);
        long startNanos = System.nanoTime();
        Throwable failure = null;
        try {
            filterChain.doFilter(cachedRequest, cachedResponse);
        } catch (ServletException | IOException | RuntimeException ex) {
            failure = ex;
            throw ex;
        } finally {
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
            BodyContent requestBody = bodyContent(cachedRequest.getContentAsByteArray());
            BodyContent responseBody = bodyContent(cachedResponse.getContentAsByteArray());
            String sanitizedRequestBody = sanitizeBody(requestBody.text());
            String sanitizedResponseBody = sanitizeBody(responseBody.text());
            String sanitizedQuery = sanitizeQuery(request.getQueryString());
            ApiMetadata metadata = metadata(sanitizedQuery, sanitizedRequestBody, sanitizedResponseBody, traceId);
            int status = cachedResponse.getStatus();
            boolean error = failure != null || status >= 400;
            log.info(
                    "[API] {} {}{} body={} -> {} {}ms response={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    sanitizedQuery.isBlank() ? "" : "?" + sanitizedQuery,
                    consoleBody(sanitizedRequestBody),
                    status,
                    elapsedMs,
                    consoleBody(sanitizedResponseBody)
            );
            cachedResponse.copyBodyToResponse();
            recordMessages(
                    traceId,
                    requestLoggedAt,
                    LocalDateTime.now(LOG_ZONE),
                    request,
                    cachedResponse,
                    sanitizedQuery,
                    sanitizedRequestBody,
                    sanitizedResponseBody,
                    requestBody,
                    responseBody,
                    metadata,
                    status,
                    elapsedMs,
                    error
            );
        }
    }

    private String sanitizeQuery(String query) {
        if (query == null || query.isBlank()) return "";
        StringBuilder sanitized = new StringBuilder();
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
        return trim(sanitized.toString(), 1000);
    }

    private BodyContent bodyContent(byte[] bytes) {
        if (bytes.length == 0) return new BodyContent("", 0, false);
        String value = new String(bytes, StandardCharsets.UTF_8).replace('\n', ' ').replace('\r', ' ').trim();
        boolean truncated = value.length() > MAX_STORED_BODY_LENGTH;
        return new BodyContent(truncated ? value.substring(0, MAX_STORED_BODY_LENGTH) + "..." : value, bytes.length, truncated);
    }

    private String sanitizeBody(String body) {
        if (body.isBlank()) return "-";
        return SENSITIVE_JSON_FIELD.matcher(body).replaceAll("$1***$3");
    }

    private String consoleBody(String body) {
        if (body.isBlank()) return "-";
        if (body.length() <= MAX_CONSOLE_BODY_LENGTH) return body;
        return body.substring(0, MAX_CONSOLE_BODY_LENGTH) + "...";
    }

    private void recordMessages(
            String traceId,
            LocalDateTime requestLoggedAt,
            LocalDateTime responseLoggedAt,
            HttpServletRequest request,
            HttpServletResponse response,
            String sanitizedQuery,
            String sanitizedRequestBody,
            String sanitizedResponseBody,
            BodyContent requestBody,
            BodyContent responseBody,
            ApiMetadata metadata,
            int status,
            long elapsedMs,
            boolean error
    ) {
        String method = trim(request.getMethod(), 12);
        String path = trim(request.getRequestURI(), 255);
        String clientIp = trim(clientIp(request), 64);
        String userAgent = trim(request.getHeader("User-Agent"), 512);
        apiMessageLogService.record(new ApiMessageLogEntry(
                traceId,
                "frontend_to_backend",
                requestLoggedAt,
                method,
                path,
                sanitizedQuery.isBlank() ? null : sanitizedQuery,
                null,
                null,
                clientIp,
                userAgent,
                trim(request.getContentType(), 128),
                metadata.userId(),
                metadata.matchId(),
                metadata.requestId(),
                sanitizedRequestBody,
                requestBody.bytes(),
                requestBody.truncated(),
                false
        ));
        apiMessageLogService.record(new ApiMessageLogEntry(
                traceId,
                "backend_to_frontend",
                responseLoggedAt,
                method,
                path,
                sanitizedQuery.isBlank() ? null : sanitizedQuery,
                status,
                elapsedMs,
                clientIp,
                userAgent,
                trim(response.getContentType(), 128),
                metadata.userId(),
                metadata.matchId(),
                metadata.requestId(),
                sanitizedResponseBody,
                responseBody.bytes(),
                responseBody.truncated(),
                error
        ));
    }

    private ApiMetadata metadata(String query, String requestBody, String responseBody, String traceId) {
        JsonNode requestJson = parseJson(requestBody);
        JsonNode responseJson = parseJson(responseBody);
        Long userId = queryLong(query, "userId");
        if (userId == null) userId = findLong(requestJson, "userId");
        if (userId == null) userId = findLong(responseJson, "userId");
        if (userId == null) userId = findUserId(responseJson);
        String matchId = queryValue(query, "matchId");
        if (matchId.isBlank()) matchId = findText(requestJson, "matchId");
        if (matchId.isBlank()) matchId = findText(responseJson, "matchId");
        String requestId = queryValue(query, "requestId");
        if (requestId.isBlank()) requestId = findText(requestJson, "requestId");
        if (requestId.isBlank()) requestId = findText(requestJson, "commandId");
        if (requestId.isBlank()) requestId = findText(responseJson, "requestId");
        if (requestId.isBlank()) requestId = traceId;
        return new ApiMetadata(userId, blankToNull(trim(matchId, 96)), blankToNull(trim(requestId, 128)));
    }

    private JsonNode parseJson(String text) {
        if (text == null || text.isBlank() || "-".equals(text)) return null;
        try {
            return objectMapper.readTree(text);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String findText(JsonNode node, String fieldName) {
        if (node == null) return "";
        if (node.isObject() && node.has(fieldName) && !node.get(fieldName).isNull()) {
            return node.get(fieldName).asText("");
        }
        if (node.isContainerNode()) {
            for (JsonNode child : node) {
                String value = findText(child, fieldName);
                if (!value.isBlank()) return value;
            }
        }
        return "";
    }

    private Long findLong(JsonNode node, String fieldName) {
        String value = findText(node, fieldName);
        return parseLong(value);
    }

    private Long findUserId(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        JsonNode user = node.get("user");
        if (user != null && user.isObject()) {
            return parseLong(user.path("id").asText(""));
        }
        return null;
    }

    private Long queryLong(String query, String key) {
        return parseLong(queryValue(query, key));
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String queryValue(String query, String key) {
        if (query == null || query.isBlank()) return "";
        String[] parts = query.split("&");
        for (String part : parts) {
            int equalsIndex = part.indexOf('=');
            String currentKey = equalsIndex >= 0 ? part.substring(0, equalsIndex) : part;
            if (currentKey.equals(key)) {
                return equalsIndex >= 0 ? part.substring(equalsIndex + 1) : "";
            }
        }
        return "";
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return comma >= 0 ? forwarded.substring(0, comma).trim() : forwarded.trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        return request.getRemoteAddr();
    }

    private String trim(String value, int maxLength) {
        if (value == null) return null;
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private record BodyContent(String text, int bytes, boolean truncated) {
    }

    private record ApiMetadata(Long userId, String matchId, String requestId) {
    }
}
