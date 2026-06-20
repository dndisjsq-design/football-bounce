package com.footballbounce.server.controller;

import com.footballbounce.server.dto.match.OnlineMatchDtos.CancelRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ActionPollRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ActionResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.JoinRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.MatchmakingResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ResultResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.StatusRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SubmitResultRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SubmitShootRequest;
import com.footballbounce.server.service.OnlineMatchService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/online-match")
public class OnlineMatchController {

    private final OnlineMatchService onlineMatchService;

    public OnlineMatchController(OnlineMatchService onlineMatchService) {
        this.onlineMatchService = onlineMatchService;
    }

    @PostMapping("/join")
    public MatchmakingResponse join(@RequestBody JoinRequest request) {
        return onlineMatchService.join(request);
    }

    @PostMapping("/status")
    public MatchmakingResponse status(@RequestBody StatusRequest request) {
        return onlineMatchService.status(request);
    }

    @PostMapping("/cancel")
    public MatchmakingResponse cancel(@RequestBody CancelRequest request) {
        return onlineMatchService.cancel(request);
    }

    @PostMapping("/shoot")
    public ActionResponse shoot(@RequestBody SubmitShootRequest request) {
        return onlineMatchService.submitShoot(request);
    }

    @PostMapping("/actions")
    public ActionResponse actions(@RequestBody ActionPollRequest request) {
        return onlineMatchService.pollActions(request);
    }

    @PostMapping("/clock")
    public ClockResponse clock(@RequestBody ClockRequest request) {
        return onlineMatchService.clock(request);
    }

    @PostMapping("/result")
    public ResultResponse result(@RequestBody SubmitResultRequest request) {
        return onlineMatchService.submitResult(request);
    }

    @PostMapping("/settlement")
    public SettlementResponse settlement(@RequestBody SettlementRequest request) {
        return onlineMatchService.settlement(request);
    }
}
