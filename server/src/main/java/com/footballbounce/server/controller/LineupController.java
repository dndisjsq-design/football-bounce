package com.footballbounce.server.controller;

import com.footballbounce.server.dto.LineupSaveRequest;
import com.footballbounce.server.dto.LineupStateResponse;
import com.footballbounce.server.service.LineupService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/lineup")
public class LineupController {
    private final LineupService lineupService;

    public LineupController(LineupService lineupService) {
        this.lineupService = lineupService;
    }

    @GetMapping("/state")
    public LineupStateResponse getState(@NotNull(message = "用户id不能为空") @RequestParam Long userId) {
        return lineupService.getState(userId);
    }

    @PostMapping("/state")
    public LineupStateResponse saveState(@Valid @RequestBody LineupSaveRequest request) {
        return lineupService.saveState(request);
    }
}
