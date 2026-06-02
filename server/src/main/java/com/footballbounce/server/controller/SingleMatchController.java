package com.footballbounce.server.controller;

import com.footballbounce.server.dto.match.SingleMatchDtos.AbandonRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AbandonResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiKeeperRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiKeeperResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiShootRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.AiShootResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.FinishRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.FinishResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.MatchEventRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.MatchEventResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.ShootRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.ShootResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotValidationRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.SnapshotValidationResponse;
import com.footballbounce.server.dto.match.SingleMatchDtos.StartRequest;
import com.footballbounce.server.dto.match.SingleMatchDtos.StartResponse;
import com.footballbounce.server.service.SingleMatchService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/single-match")
public class SingleMatchController {

    private final SingleMatchService singleMatchService;

    public SingleMatchController(SingleMatchService singleMatchService) {
        this.singleMatchService = singleMatchService;
    }

    @PostMapping("/start")
    public StartResponse start(@RequestBody StartRequest request) {
        return singleMatchService.start(request);
    }

    @PostMapping("/shoot")
    public ShootResponse shoot(@RequestBody ShootRequest request) {
        return singleMatchService.submitShoot(request);
    }

    @PostMapping("/ai-shoot")
    public AiShootResponse aiShoot(@RequestBody AiShootRequest request) {
        return singleMatchService.requestAiShoot(request);
    }

    @PostMapping("/ai-keeper")
    public AiKeeperResponse aiKeeper(@RequestBody AiKeeperRequest request) {
        return singleMatchService.requestAiKeeper(request);
    }

    @PostMapping("/snapshot")
    public SnapshotValidationResponse snapshot(@RequestBody SnapshotValidationRequest request) {
        return singleMatchService.validateSnapshot(request);
    }

    @PostMapping("/event")
    public MatchEventResponse event(@RequestBody MatchEventRequest request) {
        return singleMatchService.recordEvent(request);
    }

    @PostMapping("/finish")
    public FinishResponse finish(@RequestBody FinishRequest request) {
        return singleMatchService.finish(request);
    }

    @PostMapping("/abandon")
    public AbandonResponse abandon(@RequestBody AbandonRequest request) {
        return singleMatchService.abandon(request);
    }
}
