package com.footballbounce.server.controller;

import com.footballbounce.server.dto.match.MatchRecordDtos.GuestSessionClearRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.GuestSessionClearResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.RecentRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.RecentResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.ReplayRequest;
import com.footballbounce.server.dto.match.MatchRecordDtos.ReplayResponse;
import com.footballbounce.server.dto.match.MatchRecordDtos.SettlementResponse;
import com.footballbounce.server.service.MatchRecordService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/match-records")
public class MatchRecordController {

    private final MatchRecordService matchRecordService;

    public MatchRecordController(MatchRecordService matchRecordService) {
        this.matchRecordService = matchRecordService;
    }

    @PostMapping("/recent")
    public RecentResponse recent(@RequestBody RecentRequest request) {
        return matchRecordService.recent(request);
    }

    @PostMapping("/replay")
    public ReplayResponse replay(@RequestBody ReplayRequest request) {
        return matchRecordService.replay(request);
    }

    @PostMapping("/settlement")
    public SettlementResponse settlement(@RequestBody ReplayRequest request) {
        return matchRecordService.settlement(request);
    }

    @PostMapping("/guest-session/clear")
    public GuestSessionClearResponse clearGuestSession(@RequestBody GuestSessionClearRequest request) {
        return matchRecordService.clearGuestSession(request);
    }
}
