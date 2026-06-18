package com.footballbounce.server.service;

import com.footballbounce.server.domain.PlayerData;
import com.footballbounce.server.domain.UserAccount;
import com.footballbounce.server.dto.ApiResponse;
import com.footballbounce.server.dto.LineupPlayerDto;
import com.footballbounce.server.dto.UserSummaryDto;
import com.footballbounce.server.dto.shop.ShopDtos.DrawPackRequest;
import com.footballbounce.server.dto.shop.ShopDtos.DrawPackResult;
import com.footballbounce.server.dto.shop.ShopDtos.PurchaseFormationRequest;
import com.footballbounce.server.dto.shop.ShopDtos.PurchasePlayerRequest;
import com.footballbounce.server.dto.shop.ShopDtos.PurchaseResult;
import com.footballbounce.server.repository.CoinTransactionMapper;
import com.footballbounce.server.repository.LineupMapper;
import com.footballbounce.server.repository.UserMapper;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShopService {
    private static final int SINGLE_DRAW_PRICE = 100;
    private static final int TEN_DRAW_PRICE = 1000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final Map<String, Integer> FORMATION_PLAYER_COUNTS = Map.ofEntries(
            Map.entry("balanced-221", 5),
            Map.entry("midfield-131", 5),
            Map.entry("defense-311", 5),
            Map.entry("attack-122", 5),
            Map.entry("diamond-212", 5),
            Map.entry("wall-300", 3),
            Map.entry("blade-201", 3),
            Map.entry("bridge-111", 3),
            Map.entry("wing-210", 3),
            Map.entry("spear-120", 3),
            Map.entry("square-220", 4),
            Map.entry("shield-301", 4),
            Map.entry("diamond-121", 4),
            Map.entry("lane-112", 4),
            Map.entry("fan-130", 4),
            Map.entry("lock-310", 4),
            Map.entry("curve-211", 4),
            Map.entry("cross-202", 4),
            Map.entry("arrow-221", 5),
            Map.entry("storm-131", 5),
            Map.entry("fort-311", 5),
            Map.entry("twin-122", 5),
            Map.entry("wave-212", 5),
            Map.entry("hook-113", 5),
            Map.entry("net-401", 5)
    );

    private final LineupMapper lineupMapper;
    private final UserMapper userMapper;
    private final CoinTransactionMapper coinTransactionMapper;

    public ShopService(LineupMapper lineupMapper, UserMapper userMapper, CoinTransactionMapper coinTransactionMapper) {
        this.lineupMapper = lineupMapper;
        this.userMapper = userMapper;
        this.coinTransactionMapper = coinTransactionMapper;
    }

    @Transactional
    public ApiResponse<PurchaseResult> purchasePlayer(PurchasePlayerRequest request) {
        Long userId = normalizeUserId(request == null ? null : request.userId());
        String playerId = normalizeId(request == null ? null : request.playerId());
        if (userId == null || playerId.isEmpty()) return ApiResponse.fail("购买参数错误");
        PlayerData player = lineupMapper.findPlayerById(playerId);
        if (player == null) return ApiResponse.failWithUser("球员不存在", userSummary(userId));
        if (lineupMapper.countOwnedPlayer(userId, playerId) > 0) return ApiResponse.failWithUser("已拥有该球员", userSummary(userId));
        int price = playerPrice(player);
        ApiResponse<Void> debit = debit(userId, price, "purchase_player", playerId);
        if (!debit.ok()) return ApiResponse.failWithUser(debit.message(), debit.userSummary());
        lineupMapper.insertOwnedPlayerIfAbsent(userId, playerId);
        UserSummaryDto summary = userSummary(userId);
        return ApiResponse.okWithUser("购买成功", new PurchaseResult(playerId, price), summary);
    }

    @Transactional
    public ApiResponse<PurchaseResult> purchaseFormation(PurchaseFormationRequest request) {
        Long userId = normalizeUserId(request == null ? null : request.userId());
        String formationId = normalizeId(request == null ? null : request.formationId());
        if (userId == null || formationId.isEmpty()) return ApiResponse.fail("购买参数错误");
        Integer count = FORMATION_PLAYER_COUNTS.get(formationId);
        if (count == null) return ApiResponse.failWithUser("阵型不存在", userSummary(userId));
        if (lineupMapper.countOwnedFormation(userId, formationId) > 0) return ApiResponse.failWithUser("已拥有该阵型", userSummary(userId));
        int price = formationPrice(count);
        ApiResponse<Void> debit = debit(userId, price, "purchase_formation", formationId);
        if (!debit.ok()) return ApiResponse.failWithUser(debit.message(), debit.userSummary());
        lineupMapper.insertOwnedFormationIfAbsent(userId, formationId, 100 + FORMATION_PLAYER_COUNTS.keySet().stream().toList().indexOf(formationId));
        UserSummaryDto summary = userSummary(userId);
        return ApiResponse.okWithUser("购买成功", new PurchaseResult(formationId, price), summary);
    }

    @Transactional
    public ApiResponse<DrawPackResult> drawPack(DrawPackRequest request) {
        Long userId = normalizeUserId(request == null ? null : request.userId());
        String packId = normalizeId(request == null ? null : request.packId());
        int count = request == null || request.count() == null ? 0 : request.count();
        if (userId == null || packId.isEmpty() || (count != 1 && count != 10)) return ApiResponse.fail("抽球参数错误");
        if (!List.of("blaze", "galaxy", "bolt", "wall").contains(packId)) return ApiResponse.failWithUser("卡包不存在", userSummary(userId));
        List<PlayerData> packPlayers = buildPack(lineupMapper.findAllPlayers(), packId);
        if (packPlayers.isEmpty()) return ApiResponse.failWithUser("卡包球员池为空", userSummary(userId));
        int price = count == 10 ? TEN_DRAW_PRICE : SINGLE_DRAW_PRICE;
        ApiResponse<Void> debit = debit(userId, price, "draw_pack", packId + ":" + count);
        if (!debit.ok()) return ApiResponse.failWithUser(debit.message(), debit.userSummary());
        List<PlayerData> results = new ArrayList<>();
        for (int i = 0; i < count; i += 1) {
            PlayerData player = drawOne(packPlayers);
            results.add(player);
            lineupMapper.insertOwnedPlayerIfAbsent(userId, player.getPlayerId());
        }
        UserSummaryDto summary = userSummary(userId);
        DrawPackResult result = new DrawPackResult(packId, count, price, results.stream().map(LineupPlayerDto::from).toList());
        return ApiResponse.okWithUser("抽球成功", result, summary);
    }

    private ApiResponse<Void> debit(Long userId, int amount, String reason, String relatedId) {
        if (amount <= 0) return ApiResponse.failWithUser("金币数量错误", userSummary(userId));
        UserSummaryDto before = userSummary(userId);
        if (before == null) return ApiResponse.fail("用户不存在");
        int updated = userMapper.deductCoinsIfEnough(userId, amount);
        UserSummaryDto after = userSummary(userId);
        if (updated <= 0) return ApiResponse.failWithUser("金币不足", after == null ? before : after);
        coinTransactionMapper.insert(userId, -amount, after == null || after.coins() == null ? 0 : after.coins(), reason, relatedId);
        return ApiResponse.okWithUser("扣款成功", null, after);
    }

    private UserSummaryDto userSummary(Long userId) {
        UserAccount user = userMapper.findById(userId);
        return UserSummaryDto.from(user);
    }

    private int playerPrice(PlayerData player) {
        int score = player.getScore() == null ? 0 : player.getScore();
        return switch (player.getRarity() == null ? "" : player.getRarity()) {
            case "red" -> score * 100;
            case "orange" -> score * 10;
            case "purple" -> score;
            default -> Math.floorDiv(score, 10);
        };
    }

    private int formationPrice(int playerCount) {
        if (playerCount <= 3) return 100;
        if (playerCount == 4) return 500;
        return 1000;
    }

    private List<PlayerData> buildPack(List<PlayerData> players, String packId) {
        int packIndex = switch (packId) {
            case "galaxy" -> 1;
            case "bolt" -> 2;
            case "wall" -> 3;
            default -> 0;
        };
        Map<String, List<PlayerData>> byRarity = new HashMap<>();
        for (String rarity : List.of("red", "orange", "purple", "blue")) {
            byRarity.put(rarity, players.stream()
                    .filter(player -> rarity.equals(player.getRarity()))
                    .sorted(Comparator.comparing(PlayerData::getScore, Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(PlayerData::getPlayerId))
                    .toList());
        }
        List<PlayerData> result = new ArrayList<>();
        result.addAll(topDistributedGroup(byRarity.get("red"), packIndex));
        result.addAll(topDistributedGroup(byRarity.get("orange"), packIndex));
        result.addAll(cyclicSlice(byRarity.get("purple"), packIndex * 5, 10));
        result.addAll(cyclicSlice(byRarity.get("blue"), 0, 20));
        return result;
    }

    private List<PlayerData> topDistributedGroup(List<PlayerData> players, int packIndex) {
        List<PlayerData> result = new ArrayList<>();
        if (players == null || players.isEmpty()) return result;
        if (packIndex < players.size()) result.add(players.get(packIndex));
        for (int i = 4 + packIndex * 4; i < 8 + packIndex * 4 && i < players.size(); i += 1) result.add(players.get(i));
        return result;
    }

    private List<PlayerData> cyclicSlice(List<PlayerData> players, int start, int count) {
        List<PlayerData> result = new ArrayList<>();
        if (players == null || players.isEmpty()) return result;
        for (int i = 0; i < count; i += 1) result.add(players.get((start + i) % players.size()));
        return result;
    }

    private PlayerData drawOne(List<PlayerData> players) {
        String rarity = drawRarity();
        List<PlayerData> pool = players.stream().filter(player -> rarity.equals(player.getRarity())).toList();
        List<PlayerData> effectivePool = pool.isEmpty() ? players : pool;
        return effectivePool.get(RANDOM.nextInt(effectivePool.size()));
    }

    private String drawRarity() {
        double roll = RANDOM.nextDouble();
        if (roll < 0.50) return "red";
        if (roll < 0.60) return "orange";
        if (roll < 0.80) return "purple";
        return "blue";
    }

    private Long normalizeUserId(Long userId) {
        return userId == null || userId <= 0 ? null : userId;
    }

    private String normalizeId(String value) {
        return value == null ? "" : value.trim();
    }
}
