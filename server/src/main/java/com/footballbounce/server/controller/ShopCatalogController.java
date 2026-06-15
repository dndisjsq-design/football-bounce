package com.footballbounce.server.controller;

import com.footballbounce.server.dto.LineupPlayerDto;
import com.footballbounce.server.dto.ShopPlayerDetailDto;
import com.footballbounce.server.domain.PlayerData;
import com.footballbounce.server.repository.LineupMapper;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

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

    @GetMapping("/players/{playerId}")
    public ResponseEntity<ShopPlayerDetailDto> playerDetail(@PathVariable String playerId) {
        PlayerData player = lineupMapper.findPlayerById(playerId);
        if (player == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ShopPlayerDetailDto.from(player));
    }
}
