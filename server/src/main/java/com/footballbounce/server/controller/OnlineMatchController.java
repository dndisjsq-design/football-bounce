package com.footballbounce.server.controller;

import com.footballbounce.server.dto.match.OnlineMatchDtos.CancelRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ActionResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ClockResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.FinishCheckResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.JoinRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.MatchmakingResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.OpponentActionRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ReadyRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ReadyResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ScoreRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.ScoreResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SettlementResponse;
import com.footballbounce.server.dto.match.OnlineMatchDtos.StatusRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.SubmitShootRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.TurnRequest;
import com.footballbounce.server.dto.match.OnlineMatchDtos.TurnResponse;
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

    @PostMapping("/clock")
    public ClockResponse clock(@RequestBody ClockRequest request) {
        return onlineMatchService.clock(request);
    }

    @PostMapping("/ready")
    public ReadyResponse ready(@RequestBody ReadyRequest request) {
        return onlineMatchService.ready(request);
    }

    @PostMapping("/turn-request")
    public TurnResponse turnRequest(@RequestBody TurnRequest request) {
        return onlineMatchService.turnRequest(request);
    }

    @PostMapping("/opponent-action")
    public ActionResponse opponentAction(@RequestBody OpponentActionRequest request) {
        return onlineMatchService.pollOpponentAction(request);
    }

    @PostMapping("/score")
    public ScoreResponse score(@RequestBody ScoreRequest request) {
        return onlineMatchService.score(request);
    }

    @PostMapping("/finish-check")
    public FinishCheckResponse finishCheck(@RequestBody FinishCheckRequest request) {
        return onlineMatchService.finishCheck(request);
    }

    @PostMapping("/settlement")
    public SettlementResponse settlement(@RequestBody SettlementRequest request) {
        return onlineMatchService.settlement(request);
    }
}
