package com.footballbounce.server.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ApiMessageLogCleanupService {
    private static final Logger log = LoggerFactory.getLogger(ApiMessageLogCleanupService.class);
    private static final ZoneId CLEANUP_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int RETENTION_DAYS = 7;

    private final ApiMessageLogService apiMessageLogService;

    public ApiMessageLogCleanupService(ApiMessageLogService apiMessageLogService) {
        this.apiMessageLogService = apiMessageLogService;
    }

    @Scheduled(cron = "0 0 0 ? * FRI", zone = "Asia/Shanghai")
    public void cleanupAtFridayBeijingMidnight() {
        LocalDateTime cutoff = LocalDate.now(CLEANUP_ZONE).minusDays(RETENTION_DAYS).atStartOfDay();
        int deleted = apiMessageLogService.deleteBefore(cutoff);
        if (deleted > 0) {
            log.info("Cleaned expired API message logs before {}: deleted={}", cutoff, deleted);
        }
    }
}
