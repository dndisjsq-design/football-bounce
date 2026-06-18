package com.footballbounce.server.service;

import com.footballbounce.server.domain.UserAccount;
import com.footballbounce.server.dto.UserSummaryDto;
import com.footballbounce.server.repository.CoinTransactionMapper;
import com.footballbounce.server.repository.UserMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MatchRewardService {
    private static final int SINGLE_WIN_REWARD_COINS = 10;
    private static final int ONLINE_WIN_REWARD_COINS = 20;
    private static final int SINGLE_DAILY_REWARD_CAP_COINS = 10;
    private static final int ONLINE_DAILY_REWARD_CAP_COINS = 200;
    private static final String SINGLE_WIN_REWARD_REASON = "match_win_single";
    private static final String ONLINE_WIN_REWARD_REASON = "match_win_online";
    private static final ZoneId REWARD_ZONE = ZoneId.of("Asia/Shanghai");

    private final UserMapper userMapper;
    private final CoinTransactionMapper coinTransactionMapper;

    public MatchRewardService(UserMapper userMapper, CoinTransactionMapper coinTransactionMapper) {
        this.userMapper = userMapper;
        this.coinTransactionMapper = coinTransactionMapper;
    }

    @Transactional
    public UserSummaryDto grantSingleWinReward(long userId, String matchNo) {
        return grantMatchReward(userId, SINGLE_WIN_REWARD_COINS, SINGLE_DAILY_REWARD_CAP_COINS, SINGLE_WIN_REWARD_REASON, matchNo);
    }

    @Transactional
    public UserSummaryDto grantOnlineWinReward(long userId, String matchNo) {
        return grantMatchReward(userId, ONLINE_WIN_REWARD_COINS, ONLINE_DAILY_REWARD_CAP_COINS, ONLINE_WIN_REWARD_REASON, matchNo);
    }

    @Transactional
    public UserSummaryDto recordSingleMatchResult(long userId, String matchNo, boolean win) {
        userMapper.incrementSingleMatchStats(userId, win ? 1 : 0);
        if (!win) {
            return UserSummaryDto.from(userMapper.findById(userId));
        }
        return grantMatchReward(userId, SINGLE_WIN_REWARD_COINS, SINGLE_DAILY_REWARD_CAP_COINS, SINGLE_WIN_REWARD_REASON, matchNo);
    }

    @Transactional
    public UserSummaryDto recordOnlineMatchResult(long userId, String matchNo, boolean win) {
        userMapper.incrementOnlineMatchStats(userId, win ? 1 : 0);
        if (!win) {
            return UserSummaryDto.from(userMapper.findById(userId));
        }
        return grantMatchReward(userId, ONLINE_WIN_REWARD_COINS, ONLINE_DAILY_REWARD_CAP_COINS, ONLINE_WIN_REWARD_REASON, matchNo);
    }

    private UserSummaryDto grantMatchReward(long userId, int reward, int dailyCap, String reason, String relatedId) {
        RewardWindow window = rewardWindow();
        int earnedToday = Math.max(0, coinTransactionMapper.sumChangeAmountByReasonBetween(userId, reason, window.start(), window.end()));
        int grant = Math.min(reward, Math.max(0, dailyCap - earnedToday));
        if (grant <= 0) {
            return UserSummaryDto.from(userMapper.findById(userId));
        }
        int updated = userMapper.addCoins(userId, grant);
        UserAccount user = userMapper.findById(userId);
        UserSummaryDto summary = UserSummaryDto.from(user);
        if (updated > 0 && user != null) {
            coinTransactionMapper.insert(userId, grant, user.getCoins(), reason, relatedId);
        }
        return summary;
    }

    private RewardWindow rewardWindow() {
        LocalDate today = LocalDate.now(REWARD_ZONE);
        LocalDateTime start = today.atStartOfDay();
        return new RewardWindow(start, start.plusDays(1));
    }

    private record RewardWindow(LocalDateTime start, LocalDateTime end) {
    }
}
