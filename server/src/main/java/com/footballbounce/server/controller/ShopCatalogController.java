package com.footballbounce.server.controller;

import com.footballbounce.server.dto.LineupPlayerDto;
import com.footballbounce.server.repository.LineupMapper;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shop")
public class ShopCatalogController {
    private final LineupMapper lineupMapper;

    public ShopCatalogController(LineupMapper lineupMapper) {
        this.lineupMapper = lineupMapper;
    }

    @GetMapping("/players")
    public List<LineupPlayerDto> players() {
        return lineupMapper.findAllPlayers().stream().map(LineupPlayerDto::from).toList();
    }
}
