package com.footballbounce.server.service;

import com.footballbounce.server.repository.ApiMessageLogMapper;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ApiMessageLogService {
    private static final Logger log = LoggerFactory.getLogger(ApiMessageLogService.class);

    private final ApiMessageLogMapper mapper;

    public ApiMessageLogService(ApiMessageLogMapper mapper) {
        this.mapper = mapper;
    }

    public void record(ApiMessageLogEntry entry) {
        try {
            mapper.insert(
                    entry.traceId(),
                    entry.direction(),
                    entry.loggedAt(),
                    entry.method(),
                    entry.path(),
                    entry.queryString(),
                    entry.statusCode(),
                    entry.durationMs(),
                    entry.clientIp(),
                    entry.userAgent(),
                    entry.contentType(),
                    entry.userId(),
                    entry.matchId(),
                    entry.requestId(),
                    entry.messageBody(),
                    entry.bodyBytes(),
                    entry.truncated(),
                    entry.error()
            );
        } catch (Exception ex) {
            log.warn("API message log write failed: traceId={}, direction={}, path={}", entry.traceId(), entry.direction(), entry.path(), ex);
        }
    }

    public int deleteBefore(LocalDateTime cutoff) {
        try {
            return mapper.deleteBefore(cutoff);
        } catch (Exception ex) {
            log.warn("API message log cleanup failed before {}", cutoff, ex);
            return 0;
        }
    }

    public record ApiMessageLogEntry(
            String traceId,
            String direction,
            LocalDateTime loggedAt,
            String method,
            String path,
            String queryString,
            Integer statusCode,
            Long durationMs,
            String clientIp,
            String userAgent,
            String contentType,
            Long userId,
            String matchId,
            String requestId,
            String messageBody,
            int bodyBytes,
            boolean truncated,
            boolean error
    ) {
    }
}
