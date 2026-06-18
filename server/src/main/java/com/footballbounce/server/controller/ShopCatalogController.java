package com.footballbounce.server.controller;

import com.footballbounce.server.dto.LineupPlayerDto;
import com.footballbounce.server.dto.ShopPlayerDetailDto;
import com.footballbounce.server.domain.PlayerData;
import com.footballbounce.server.dto.ApiResponse;
import com.footballbounce.server.repository.LineupMapper;
import com.footballbounce.server.service.ShopService;
import com.footballbounce.server.dto.shop.ShopDtos.DrawPackRequest;
import com.footballbounce.server.dto.shop.ShopDtos.DrawPackResult;
import com.footballbounce.server.dto.shop.ShopDtos.PurchaseFormationRequest;
import com.footballbounce.server.dto.shop.ShopDtos.PurchasePlayerRequest;
import com.footballbounce.server.dto.shop.ShopDtos.PurchaseResult;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/shop")
public class ShopCatalogController {
    private final LineupMapper lineupMapper;
    private final ShopService shopService;

    public ShopCatalogController(LineupMapper lineupMapper, ShopService shopService) {
        this.lineupMapper = lineupMapper;
        this.shopService = shopService;
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

    @PostMapping("/purchase-player")
    public ApiResponse<PurchaseResult> purchasePlayer(@RequestBody PurchasePlayerRequest request) {
        return shopService.purchasePlayer(request);
    }

    @PostMapping("/purchase-formation")
    public ApiResponse<PurchaseResult> purchaseFormation(@RequestBody PurchaseFormationRequest request) {
        return shopService.purchaseFormation(request);
    }

    @PostMapping("/draw-pack")
    public ApiResponse<DrawPackResult> drawPack(@RequestBody DrawPackRequest request) {
        return shopService.drawPack(request);
    }
}
