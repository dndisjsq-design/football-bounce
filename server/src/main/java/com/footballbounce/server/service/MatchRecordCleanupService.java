package com.footballbounce.server.service;

import com.footballbounce.server.repository.MatchRecordMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MatchRecordCleanupService {
    private static final Logger log = LoggerFactory.getLogger(MatchRecordCleanupService.class);
    private static final ZoneId CLEANUP_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int RETENTION_DAYS = 7;

    private final MatchRecordMapper matchRecordMapper;

    public MatchRecordCleanupService(MatchRecordMapper matchRecordMapper) {
        this.matchRecordMapper = matchRecordMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void cleanupOnStartup() {
        cleanupExpiredRecords();
    }

    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Shanghai")
    @Transactional
    public void cleanupAtBeijingMidnight() {
        cleanupExpiredRecords();
    }

    private void cleanupExpiredRecords() {
        LocalDateTime cutoff = LocalDate.now(CLEANUP_ZONE).minusDays(RETENTION_DAYS).atStartOfDay();
        int goals = matchRecordMapper.deleteGoalsBefore(cutoff);
        int actions = matchRecordMapper.deleteActionsBefore(cutoff);
        int records = matchRecordMapper.deleteRecordsBefore(cutoff);
        if (goals > 0 || actions > 0 || records > 0) {
            log.info("Cleaned expired match records before {}: records={}, actions={}, goals={}", cutoff, records, actions, goals);
        }
    }
}
